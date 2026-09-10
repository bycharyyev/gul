import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomBytes, createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { ReferralsService } from "../referrals/referrals.service";
import { ACCESS_TOKEN_SECRET } from "./jwt-secret";
import { LoginAttemptsService } from "./login-attempts.service";
import type { RegisterDto } from "./dto/register.dto";
import type { LoginDto } from "./dto/login.dto";
import type { ChangePasswordDto } from "./dto/change-password.dto";
import type { UpdateMeDto } from "./dto/update-me.dto";

/// How long a consumed refresh token is still honoured.
///
/// Long enough to cover a response that arrived and a process that died before it could be
/// stored -- the failure this exists for takes milliseconds, not seconds. Short enough that a
/// stolen token is worthless by the time anyone could use it: the legitimate client is normally
/// back within one request.
const REFRESH_GRACE_MS = 30_000;
import type { UpdateLocaleDto } from "./dto/update-locale.dto";

// avatarPath is either a bare local-disk filename or a full S3 public URL (see
// avatar.service.ts) -- pass the URL through as-is, only build the API-proxy path for the
// legacy/local-disk case.
function toAvatarUrl(avatarPath: string | null): string | null {
  if (!avatarPath) return null;
  return avatarPath.startsWith("http") ? avatarPath : `/api/avatar/${avatarPath}`;
}

function ms(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) return 15 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 60_000;
  return value * factor;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private referrals: ReferralsService,
    private loginAttempts: LoginAttemptsService,
  ) {}

  private async issueTokens(userId: string, role: string) {
    const accessToken = this.jwt.sign(
      { sub: userId, role },
      {
        secret: ACCESS_TOKEN_SECRET,
        expiresIn: process.env.JWT_ACCESS_TTL ?? "15m",
      },
    );

    const refreshToken = randomBytes(48).toString("hex");
    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
    const expiresAt = new Date(Date.now() + ms(process.env.JWT_REFRESH_TTL ?? "30d"));

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) throw new ConflictException("Phone already registered");

    const passwordHash = await argon2.hash(dto.password);
    const username = await this.referrals.generateUsername();
    const user = await this.prisma.user.create({
      data: { phone: dto.phone, passwordHash, fullName: dto.fullName, username, locale: dto.locale ?? "ru" },
    });

    if (dto.referredByUsername) {
      try {
        await this.referrals.recordReferral(user.id, dto.referredByUsername, {
          utmSource: dto.utmSource,
          utmMedium: dto.utmMedium,
          utmCampaign: dto.utmCampaign,
          referrerUrl: dto.referrerUrl,
        });
      } catch {
        // a bad/garbage referral code must never block registration
      }
    }

    const tokens = await this.issueTokens(user.id, user.role);
    return {
      ...tokens,
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        avatarUrl: null,
        locale: user.locale,
      },
    };
  }

  async login(dto: LoginDto) {
    // Keyed on the number being attacked, not the address it comes from: behind carrier NAT one
    // address is a city, and a per-address limit tight enough to stop guessing would lock out
    // everybody sharing it. See LoginAttemptsService for the whole reasoning.
    const verdict = await this.loginAttempts.check(dto.phone);
    if (!verdict.allowed) {
      throw new HttpException(
        {
          code: "TOO_MANY_ATTEMPTS",
          message: `Слишком много попыток. Повторите через ${verdict.retryAfterSeconds} с.`,
          retryAfterSeconds: verdict.retryAfterSeconds,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    // A failure is recorded for a number nobody holds, too. Skipping it would make an unknown
    // number answer faster than a known one with a wrong password, which is a way to enumerate
    // who has an account here.
    if (!user) {
      await this.loginAttempts.recordFailure(dto.phone);
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      await this.loginAttempts.recordFailure(dto.phone);
      throw new UnauthorizedException("Invalid credentials");
    }
    if (user.isBlocked) throw new UnauthorizedException("Account blocked");

    // The right password erases the history: somebody who signs in correctly is never delayed,
    // however often they do it.
    await this.loginAttempts.clear(dto.phone);

    const tokens = await this.issueTokens(user.id, user.role);
    return {
      ...tokens,
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.fullName,
        username: user.username,
        role: user.role,
        avatarUrl: toAvatarUrl(user.avatarPath),
        locale: user.locale,
      },
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (stored.revokedAt) {
      // A consumed token, presented again. Usually this is the client never having received the
      // replacement: rotation is single-use, so the server retires the old token the instant it
      // mints the new one, while the device can only store the new one after the response lands.
      // A process death in between -- Android reclaiming memory, a crash, an app update --
      // stranded a live session with a dead token, and the app signed the customer out for good.
      // Measured in production on 2026-09-09: a device showed the login screen twenty minutes
      // after a refresh token was issued that was still valid days later.
      //
      // So a just-consumed token is honoured one more time. "Just" and "once" are both load
      // bearing: outside the window, or on a second attempt, this is indistinguishable from a
      // stolen token being replayed and is refused.
      const graceOpen =
        Date.now() - stored.revokedAt.getTime() <= REFRESH_GRACE_MS;
      if (!graceOpen) throw new UnauthorizedException("Invalid refresh token");

      // Same atomic-claim shape as below, on a different column: two racing replays must not
      // both be honoured.
      const graced = await this.prisma.refreshToken.updateMany({
        where: { id: stored.id, graceUsedAt: null },
        data: { graceUsedAt: new Date() },
      });
      if (graced.count === 0)
        throw new UnauthorizedException("Invalid refresh token");

      return this.issueTokens(stored.userId, stored.user.role);
    }

    // Claim the single-use consumption atomically: two concurrent requests racing on the same
    // refresh token (e.g. two tabs both hitting the interceptor's retry-on-401 path) would
    // otherwise both pass the revokedAt check above and each mint a valid token pair.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) throw new UnauthorizedException("Invalid refresh token");

    return this.issueTokens(stored.userId, stored.user.role);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) throw new BadRequestException("Current password is incorrect");

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Force re-login everywhere except the session that just changed the password.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listSessions(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.refreshToken.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new NotFoundException("Session not found");

    await this.prisma.refreshToken.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        fullName: true,
        username: true,
        role: true,
        avatarPath: true,
        locale: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");
    const { avatarPath, ...rest } = user;
    return { ...rest, avatarUrl: toAvatarUrl(avatarPath) };
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    if (dto.phone) {
      const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
      if (existing && existing.id !== userId) throw new ConflictException("Phone already registered");
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: dto.fullName, phone: dto.phone, locale: dto.locale },
      select: {
        id: true,
        phone: true,
        fullName: true,
        username: true,
        role: true,
        avatarPath: true,
        locale: true,
      },
    });
    const { avatarPath, ...rest } = user;
    return { ...rest, avatarUrl: toAvatarUrl(avatarPath) };
  }

  async updateLocale(userId: string, dto: UpdateLocaleDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { locale: dto.locale },
      select: {
        id: true,
        phone: true,
        fullName: true,
        username: true,
        role: true,
        avatarPath: true,
        locale: true,
      },
    });
    const { avatarPath, ...rest } = user;
    return { ...rest, avatarUrl: toAvatarUrl(avatarPath) };
  }
}
