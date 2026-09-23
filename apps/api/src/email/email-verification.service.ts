import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "./email.service";

/** How long a code stays usable. Short on purpose -- it is mailed, not stored anywhere reusable. */
const CODE_TTL_MINUTES = 10;
/** Wrong guesses allowed against one code before it is burned. */
const MAX_ATTEMPTS = 5;
/** Minimum gap between two requests for the same user, so "resend" can't be used to spam. */
const RESEND_COOLDOWN_SECONDS = 60;
/** Ceiling on codes issued to one user per hour, regardless of cooldown. */
const MAX_REQUESTS_PER_HOUR = 5;

/**
 * Hashing, not encryption: the code never needs to be read back, only compared. SHA-256 without
 * a salt is the right tool here despite being wrong for passwords -- the input is a
 * high-entropy-per-attempt 6-digit value with a 10-minute life and a 5-attempt cap, so there is
 * no offline-cracking window for a salt to protect against, and the constant-time compare below
 * is what actually matters.
 */
function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  /**
   * Issues a fresh verification code for `email` and mails it.
   *
   * The address is stored on the pending row rather than on the User, so an unconfirmed address
   * never becomes a send target and a typo'd one leaves no trace on the account.
   */
  async request(userId: string, rawEmail: string) {
    const email = rawEmail.trim().toLowerCase();

    const taken = await this.prisma.user.findFirst({
      where: { email, NOT: { id: userId } },
      select: { id: true },
    });
    if (taken) throw new ConflictException("Этот email уже используется другим аккаунтом");

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, locale: true, email: true, emailVerified: true },
    });
    if (!user) throw new NotFoundException("Пользователь не найден");
    if (user.email === email && user.emailVerified) {
      throw new BadRequestException("Этот email уже подтверждён");
    }

    await this.enforceRateLimits(userId);

    // Any earlier pending code is void the moment a new one is issued -- two live codes for one
    // account would double the guessing surface for no benefit.
    await this.prisma.emailVerification.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.prisma.emailVerification.create({
      data: {
        userId,
        email,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      },
    });

    await this.email.sendTemplate("AUTH_EMAIL_VERIFICATION", {
      toEmail: email,
      userId,
      locale: user.locale,
      variables: {
        user: { firstName: firstNameOf(user.fullName) },
        otp: { code, expiresIn: String(CODE_TTL_MINUTES) },
      },
    });

    // Never log the code itself -- an operator reading logs must not be able to complete
    // someone else's verification.
    this.logger.log(`email verification requested userId=${userId}`);
    return { expiresInMinutes: CODE_TTL_MINUTES };
  }

  private async enforceRateLimits(userId: string) {
    const lastRequest = await this.prisma.emailVerification.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (lastRequest) {
      const elapsedSeconds = (Date.now() - lastRequest.createdAt.getTime()) / 1000;
      if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
        throw new BadRequestException(
          `Повторный код можно запросить через ${Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds)} сек.`,
        );
      }
    }

    const recentCount = await this.prisma.emailVerification.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recentCount >= MAX_REQUESTS_PER_HOUR) {
      throw new BadRequestException("Слишком много запросов кода. Попробуйте позже.");
    }
  }

  /**
   * Consumes a code and, on success, promotes the pending address to the account's verified
   * email. Wrong guesses are counted against the row so a code can't be brute-forced.
   */
  async confirm(userId: string, code: string) {
    const pending = await this.prisma.emailVerification.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) throw new BadRequestException("Нет активного запроса на подтверждение");
    if (pending.expiresAt < new Date()) throw new BadRequestException("Срок действия кода истёк");
    if (pending.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException("Превышено число попыток. Запросите новый код.");
    }

    if (!safeEquals(pending.codeHash, hashCode(code.trim()))) {
      await this.prisma.emailVerification.update({
        where: { id: pending.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("Неверный код");
    }

    // Re-check ownership at confirm time: someone else may have verified this address during
    // the ten minutes the code was outstanding.
    const taken = await this.prisma.user.findFirst({
      where: { email: pending.email, NOT: { id: userId } },
      select: { id: true },
    });
    if (taken) throw new ConflictException("Этот email уже используется другим аккаунтом");

    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: pending.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { email: pending.email, emailVerified: true, emailVerifiedAt: new Date() },
      }),
      // A previously suppressed address that someone has now proven they control is a fresh
      // start -- otherwise an old bounce would permanently mute a valid account.
      this.prisma.emailSuppression.deleteMany({ where: { email: pending.email } }),
    ]);

    this.logger.log(`email verified userId=${userId}`);
    return { email: pending.email, emailVerified: true };
  }

  /** Current verification state, for the profile screen. */
  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true, emailVerifiedAt: true },
    });
    if (!user) throw new NotFoundException("Пользователь не найден");

    const pending = await this.prisma.emailVerification.findFirst({
      where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { email: true, expiresAt: true },
    });

    return { ...user, pendingEmail: pending?.email ?? null, pendingExpiresAt: pending?.expiresAt ?? null };
  }
}

function firstNameOf(fullName: string | null): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first || "друг";
}
