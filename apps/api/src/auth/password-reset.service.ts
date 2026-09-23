import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import * as argon2 from "argon2";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";

const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_REQUESTS_PER_HOUR = 5;

/**
 * Same reasoning as EmailVerificationService: the code never needs to be read back, only
 * compared, and a 6-digit value with a 15-minute life and a 5-attempt cap has no offline-cracking
 * window for a salt to protect against. The constant-time compare is what matters.
 */
function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function firstNameOf(fullName: string | null): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first || "друг";
}

/**
 * Password recovery by emailed code.
 *
 * Until this existed a user who forgot their password was locked out permanently -- `change
 * password` requires the current one, and login is phone + password with no other factor.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  /**
   * Starts a reset for a verified email address.
   *
   * **Always reports success**, whether or not an account exists. This endpoint is
   * unauthenticated, so a response that differed would turn it into an oracle for "is this
   * address registered here?" -- and for a top-up service, confirming someone is a customer is
   * itself a disclosure. Every branch below returns the same shape; only the logs distinguish.
   */
  async request(rawEmail: string) {
    const email = rawEmail.trim().toLowerCase();
    const generic = { sent: true, expiresInMinutes: CODE_TTL_MINUTES };

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, fullName: true, locale: true, emailVerified: true, isBlocked: true },
    });

    // An unverified address is not proof of control, so it must not be a route into the account.
    if (!user || !user.emailVerified || user.isBlocked) {
      this.logger.log("password reset requested for an unusable address");
      return generic;
    }

    // Rate limits are enforced silently: telling the caller they hit a limit would leak that the
    // address exists just as surely as a different error would.
    if (!(await this.withinRateLimits(user.id))) {
      this.logger.warn(`password reset rate-limited userId=${user.id}`);
      return generic;
    }

    await this.prisma.passwordReset.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      },
    });

    await this.email.sendTemplate("AUTH_PASSWORD_RESET", {
      toEmail: email,
      userId: user.id,
      locale: user.locale,
      variables: {
        user: { firstName: firstNameOf(user.fullName) },
        otp: { code, expiresIn: String(CODE_TTL_MINUTES) },
      },
    });

    // The code itself is never logged -- an operator reading logs must not be able to take over
    // an account.
    this.logger.log(`password reset code issued userId=${user.id}`);
    return generic;
  }

  private async withinRateLimits(userId: string): Promise<boolean> {
    const last = await this.prisma.passwordReset.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last && (Date.now() - last.createdAt.getTime()) / 1000 < RESEND_COOLDOWN_SECONDS) return false;

    const recent = await this.prisma.passwordReset.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    return recent < MAX_REQUESTS_PER_HOUR;
  }

  /**
   * Consumes a code and sets the new password.
   *
   * Here the errors *are* specific: the caller has already proven they hold a code for this
   * address, so "wrong code" or "expired" tells them nothing they could not already infer, and a
   * generic failure would make a legitimate recovery needlessly frustrating.
   */
  async confirm(rawEmail: string, code: string, newPassword: string) {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, fullName: true, locale: true, emailVerified: true, isBlocked: true },
    });
    if (!user || !user.emailVerified || user.isBlocked) {
      throw new BadRequestException("Неверный код");
    }

    const pending = await this.prisma.passwordReset.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) throw new BadRequestException("Нет активного запроса на сброс пароля");
    if (pending.expiresAt < new Date()) throw new BadRequestException("Срок действия кода истёк");
    if (pending.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException("Превышено число попыток. Запросите новый код.");
    }

    if (!safeEquals(pending.codeHash, hashCode(code.trim()))) {
      // Reserve a failed attempt conditionally. Concurrent guesses serialize on this update and
      // at most MAX_ATTEMPTS of them can consume the finite budget.
      const counted = await this.prisma.$transaction((tx) =>
        tx.passwordReset.updateMany({
          where: {
            id: pending.id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
            attempts: { lt: MAX_ATTEMPTS },
          },
          data: { attempts: { increment: 1 } },
        }),
      );
      if (counted.count === 0) {
        throw new BadRequestException("Превышено число попыток. Запросите новый код.");
      }
      throw new BadRequestException("Неверный код");
    }

    const passwordHash = await argon2.hash(newPassword);

    const consumed = await this.prisma.$transaction(async (tx) => {
      // Only one concurrent request may consume the code, and a code whose attempt budget was
      // exhausted while argon2 ran cannot sneak through afterwards.
      const claimed = await tx.passwordReset.updateMany({
        where: {
          id: pending.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
          attempts: { lt: MAX_ATTEMPTS },
        },
        data: { consumedAt: new Date() },
      });
      if (claimed.count === 0) return false;
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      // Every existing session dies. A reset is the one moment where you must assume the old
      // password was compromised -- leaving refresh tokens alive would let whoever forced the
      // reset keep their access.
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return true;
    });
    if (!consumed) throw new BadRequestException("Код уже использован или число попыток исчерпано");

    this.logger.log(`password reset completed userId=${user.id}`);

    // Best-effort notification: the account holder should learn about this even if they were not
    // the one who did it. Never allowed to fail the reset itself.
    await this.email
      .sendTemplate("ACCOUNT_PASSWORD_CHANGED", {
        toEmail: email,
        userId: user.id,
        locale: user.locale,
        variables: {
          user: { firstName: firstNameOf(user.fullName) },
          event: { at: new Date().toLocaleString("ru-RU", { timeZone: "UTC" }) + " UTC" },
        },
      })
      .catch((err) => this.logger.warn(`Could not send password-changed notice: ${err?.message ?? err}`));

    return { reset: true };
  }
}
