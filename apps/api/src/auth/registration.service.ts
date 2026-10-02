import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import * as argon2 from "argon2";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { ReferralsService } from "../referrals/referrals.service";
import { AuthService } from "./auth.service";
import type { ConfirmRegistrationDto, RegisterDto } from "./dto/register.dto";

const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_REQUESTS_PER_HOUR = 5;

/** Same reasoning as EmailVerificationService: compared, never read back; the cap is what matters. */
function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function firstNameOf(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first || "друг";
}

interface Attribution {
  referredByUsername?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrerUrl?: string;
}

/**
 * Sign-up by email, in two steps: `request` mails a code, `confirm` creates the account.
 *
 * No User row exists until the code comes back, so the address on every account is one its owner
 * has proven they read -- password reset by email always works, and nobody can park an account on
 * somebody else's address.
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private referrals: ReferralsService,
    private auth: AuthService,
  ) {}

  async request(dto: RegisterDto) {
    const email = dto.email;
    const taken = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (taken) throw new ConflictException("EMAIL_ALREADY_REGISTERED");

    await this.enforceRateLimits(email);

    // A new code voids the previous one: two live codes for one address double the guessing room.
    await this.prisma.pendingRegistration.updateMany({
      where: { email, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const attribution: Attribution = {
      referredByUsername: dto.referredByUsername,
      utmSource: dto.utmSource,
      utmMedium: dto.utmMedium,
      utmCampaign: dto.utmCampaign,
      referrerUrl: dto.referrerUrl,
    };
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.prisma.pendingRegistration.create({
      data: {
        email,
        passwordHash: await argon2.hash(dto.password),
        fullName: dto.fullName,
        locale: dto.locale ?? "ru",
        attribution: attribution as object,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      },
    });

    await this.email.sendTemplate("AUTH_EMAIL_VERIFICATION", {
      toEmail: email,
      locale: dto.locale ?? "ru",
      variables: {
        user: { firstName: firstNameOf(dto.fullName) },
        otp: { code, expiresIn: String(CODE_TTL_MINUTES) },
      },
    });

    // Never log the code: whoever reads the logs must not be able to finish someone's sign-up.
    this.logger.log("registration code requested");
    return { email, expiresInMinutes: CODE_TTL_MINUTES };
  }

  async confirm(dto: ConfirmRegistrationDto) {
    const email = dto.email;
    const pending = await this.prisma.pendingRegistration.findFirst({
      where: { email, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) throw new BadRequestException("NO_PENDING_REGISTRATION");
    if (pending.expiresAt < new Date()) throw new BadRequestException("CODE_EXPIRED");
    if (pending.attempts >= MAX_ATTEMPTS) throw new BadRequestException("TOO_MANY_CODE_ATTEMPTS");

    if (!safeEquals(pending.codeHash, hashCode(dto.code.trim()))) {
      await this.prisma.pendingRegistration.update({
        where: { id: pending.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("INVALID_CODE");
    }

    // Claim the code atomically: two confirms racing on one code must not create two accounts.
    const claimed = await this.prisma.pendingRegistration.updateMany({
      where: { id: pending.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count === 0) throw new BadRequestException("NO_PENDING_REGISTRATION");

    // Someone may have registered this address in the minutes the code was outstanding.
    const taken = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (taken) throw new ConflictException("EMAIL_ALREADY_REGISTERED");

    const user = await this.prisma.user.create({
      data: {
        email,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        passwordHash: pending.passwordHash,
        fullName: pending.fullName,
        username: await this.referrals.generateUsername(),
        locale: pending.locale,
      },
    });

    const attribution = (pending.attribution ?? {}) as Attribution;
    if (attribution.referredByUsername) {
      try {
        await this.referrals.recordReferral(user.id, attribution.referredByUsername, {
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
          referrerUrl: attribution.referrerUrl,
        });
      } catch {
        // a bad referral code must never block registration
      }
    }

    this.logger.log(`registered userId=${user.id}`);
    return this.auth.startSession(user);
  }

  private async enforceRateLimits(email: string) {
    const last = await this.prisma.pendingRegistration.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last) {
      const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) throw new BadRequestException("CODE_RECENTLY_SENT");
    }
    const recent = await this.prisma.pendingRegistration.count({
      where: { email, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recent >= MAX_REQUESTS_PER_HOUR) throw new BadRequestException("TOO_MANY_CODE_REQUESTS");
  }
}
