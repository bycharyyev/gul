import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import type { ReferrerType } from "@prisma/client";
import { SellerLedgerService } from "../seller-ledger/seller-ledger.service";

const SETTINGS_ID = "singleton";
export const USERNAME_PATTERN = /^[a-z0-9_]{2,32}$/;

/// Codes are numbers issued in order from this sequence, starting at 1000. A random string is
/// unreadable over the phone and impossible to dictate without spelling it out; a number is the
/// one form of code everybody can already exchange. Postgres hands out sequence values without
/// taking a lock, so two simultaneous registrations cannot receive the same one.
const CODE_SEQUENCE = "referral_code_seq";

type Referrer = { type: "SELLER"; sellerId: string } | { type: "CUSTOMER"; userId: string };

export interface ReferralAttribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrerUrl?: string;
}

@Injectable()
export class ReferralsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private ledger: SellerLedgerService,
  ) {}

  private toSettingsDto(settings: {
    id: string;
    enabled: boolean;
    customerRewardTmt: Prisma.Decimal;
    sellerRewardTmt: Prisma.Decimal;
    updatedAt: Date;
  }) {
    return {
      id: settings.id,
      enabled: settings.enabled,
      customerRewardTmt: Number(settings.customerRewardTmt),
      sellerRewardTmt: Number(settings.sellerRewardTmt),
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  async getSettings() {
    const settings = await this.prisma.referralSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
    return this.toSettingsDto(settings);
  }

  async updateSettings(
    input: { enabled?: boolean; customerRewardTmt?: number; sellerRewardTmt?: number },
    adminId: string,
  ) {
    const settings = await this.prisma.referralSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...input },
      update: input,
    });
    this.auditLog.record(adminId, "referral.settings.update", "ReferralSettings", SETTINGS_ID, input);
    return this.toSettingsDto(settings);
  }

  /** username doubles as this user's own referral code, so it must never collide with an
   *  existing Seller.handle either -- otherwise resolveReferrerByUsername (which checks
   *  sellers first) would silently shadow this user's code and always credit the seller.
   *  Public: also used by SellersService when creating a new seller/handle. */
  async isUsernameTaken(username: string): Promise<boolean> {
    const [user, seller] = await Promise.all([
      this.prisma.user.findUnique({ where: { username } }),
      this.prisma.seller.findUnique({ where: { handle: username } }),
    ]);
    return Boolean(user || seller);
  }

  /** Called once at registration. Low volume + single unique index -- a retry loop is fine here
   *  (unlike gallery SKUs, which need a Postgres sequence for concurrent-safe generation). */
  async generateUsername(): Promise<string> {
    // The sequence alone cannot repeat, but an admin is allowed to hand a partner a custom code,
    // and nothing stops that code from being a number the sequence has not reached yet. Checking
    // costs one indexed lookup and turns a hard registration failure into another draw.
    for (let attempt = 0; attempt < 10; attempt++) {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ value: bigint }>>(
        `SELECT nextval('${CODE_SEQUENCE}') AS value`,
      );
      const username = String(rows[0].value);
      if (!(await this.isUsernameTaken(username))) return username;
    }
    throw new Error("Failed to generate a unique referral code");
  }

  /// Staff-only. A code is an account's identity inside invitations other people have already
  /// sent, so a customer rewriting their own would break links already in circulation and strand
  /// the attribution behind them. The one real reason to change it — giving a partner who
  /// advertises a code worth reading — is a decision for staff, and it is recorded as one.
  async changeUsername(
    userId: string,
    rawUsername: string,
    actorId?: string,
  ): Promise<{ username: string }> {
    const username = rawUsername.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(username)) {
      throw new BadRequestException("Username must be 2-32 lowercase letters, digits, or underscores");
    }

    // The subject is now an arbitrary account chosen by staff, not the caller: "no such user" is a
    // real outcome and must not be reported as a naming conflict. Looked up before the collision
    // checks so a typo in the id fails on the id.
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (!before) throw new NotFoundException("User not found");

    const existingUser = await this.prisma.user.findUnique({ where: { username } });
    if (existingUser && existingUser.id !== userId) throw new ConflictException("Username already taken");

    const existingSeller = await this.prisma.seller.findUnique({ where: { handle: username } });
    if (existingSeller) throw new ConflictException("Username already taken");

    try {
      await this.prisma.user.update({ where: { id: userId }, data: { username } });
    } catch (err) {
      // Last-resort safety net against a concurrent change racing past the checks above.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Username already taken");
      }
      throw err;
    }

    if (actorId) {
      this.auditLog.record(actorId, "referral.username.change", "User", userId, {
        from: before.username,
        to: username,
      });
    }
    return { username };
  }

  async resolveReferrerByUsername(rawUsername: string): Promise<Referrer | null> {
    const username = rawUsername.trim().toLowerCase();
    if (!username) return null;
    const seller = await this.prisma.seller.findUnique({ where: { handle: username } });
    if (seller) return { type: "SELLER", sellerId: seller.id };
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (user) return { type: "CUSTOMER", userId: user.id };
    return null;
  }

  /** Fire-and-forget from AuthService.register -- a bad/garbage username must never block signup.
   *
   *  Deliberately does **not** check `settings.enabled`. Who invited whom is a fact about the
   *  signup, and it is only knowable at the moment it happens; whether we pay for it is a business
   *  decision that can be made at any time afterwards. Conflating the two -- which this did until
   *  2026-09-02 -- meant every invitation collected while the programme was switched off was
   *  discarded outright rather than merely left unpaid: `referredByUsername` was never written, no
   *  Referral row existed, and turning the programme on could not recover any of it. It also made
   *  "nobody used a code" and "everybody did, and we threw it away" look identical in the data.
   *
   *  The gate lives in `maybeRewardReferral`, which is where money actually moves.
   */
  async recordReferral(refereeUserId: string, rawUsername: string, attribution?: ReferralAttribution) {
    const referrer = await this.resolveReferrerByUsername(rawUsername);
    if (!referrer) return;
    if (referrer.type === "CUSTOMER" && referrer.userId === refereeUserId) return;

    const username = rawUsername.trim().toLowerCase();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: refereeUserId },
        data: {
          referredByUsername: username,
          referredById: referrer.type === "CUSTOMER" ? referrer.userId : undefined,
        },
      }),
      this.prisma.referral.create({
        data: {
          referrerType: referrer.type,
          referrerUserId: referrer.type === "CUSTOMER" ? referrer.userId : undefined,
          referrerSellerId: referrer.type === "SELLER" ? referrer.sellerId : undefined,
          refereeUserId,
          username,
          utmSource: attribution?.utmSource,
          utmMedium: attribution?.utmMedium,
          utmCampaign: attribution?.utmCampaign,
          referrerUrl: attribution?.referrerUrl,
        },
      }),
    ]);
  }

  /** Idempotent -- safe to call on every order-status transition. No-op if already rewarded,
   *  never referred, or the program is currently disabled. */
  async maybeRewardReferral(refereeUserId: string, qualifyingOrderId: string) {
    const settings = await this.getSettings();
    if (!settings.enabled) return;

    const referral = await this.prisma.referral.findUnique({ where: { refereeUserId } });
    if (!referral || referral.status !== "PENDING") return;

    const rewardAmount =
      referral.referrerType === "SELLER" ? settings.sellerRewardTmt : settings.customerRewardTmt;

    await this.prisma.$transaction(async (tx) => {
      // Claim the PENDING -> REWARDED transition atomically before crediting anything. If a
      // concurrent/duplicate call (e.g. a retried job) already claimed it, this affects 0 rows
      // and we no-op -- the earlier PENDING check above runs outside this transaction and can't
      // by itself prevent two overlapping calls from both crediting, the same race
      // applyReferralDiscount already guards against via a conditional updateMany.
      const claimed = await tx.referral.updateMany({
        where: { id: referral.id, status: "PENDING" },
        data: { status: "REWARDED", rewardAmountTmt: rewardAmount, rewardedAt: new Date(), qualifyingOrderId },
      });
      if (claimed.count === 0) return;

      if (referral.referrerType === "SELLER" && referral.referrerSellerId) {
        await tx.seller.update({
          where: { id: referral.referrerSellerId },
          data: { balanceTmt: { increment: rewardAmount } },
        });
        await this.ledger.record(tx, {
          sellerId: referral.referrerSellerId,
          type: "REFERRAL_CREDIT",
          amountTmt: rewardAmount,
          referenceType: "Referral",
          referenceId: referral.id,
          idempotencyKey: `referral:${referral.id}:seller-reward`,
          metadata: { qualifyingOrderId },
        });
      } else if (referral.referrerType === "CUSTOMER" && referral.referrerUserId) {
        await tx.user.update({
          where: { id: referral.referrerUserId },
          data: { referralBalanceTmt: { increment: rewardAmount } },
        });
      }
    });
  }

  /** Applies the caller's referral balance as an automatic, capped discount at order-creation
   *  time. Race-safe under concurrent orders from the same account via a conditional updateMany
   *  rather than read-then-write. */
  async applyReferralDiscount(
    userId: string,
    amount: number,
    db: Pick<Prisma.TransactionClient, "user"> = this.prisma,
  ): Promise<{ amountAfterDiscount: number; discountApplied: number }> {
    if (amount <= 0) return { amountAfterDiscount: amount, discountApplied: 0 };
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { referralBalanceTmt: true },
    });
    if (!user || Number(user.referralBalanceTmt) <= 0) return { amountAfterDiscount: amount, discountApplied: 0 };

    const deduction = Math.min(Number(user.referralBalanceTmt), amount);
    const updated = await db.user.updateMany({
      where: { id: userId, referralBalanceTmt: { gte: deduction } },
      data: { referralBalanceTmt: { decrement: deduction } },
    });
    if (updated.count === 0) return { amountAfterDiscount: amount, discountApplied: 0 };

    return { amountAfterDiscount: Math.round((amount - deduction) * 100) / 100, discountApplied: deduction };
  }

  async getMyReferralInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        referralBalanceTmt: true,
        sellerProfile: { select: { id: true, handle: true } },
      },
    });
    if (!user) throw new NotFoundException("User not found");

    const isSeller = Boolean(user.sellerProfile);
    const username = isSeller ? user.sellerProfile!.handle : user.username;
    const where = isSeller
      ? { referrerSellerId: user.sellerProfile!.id }
      : { referrerUserId: userId };

    const [totalReferred, rewarded, pending] = await Promise.all([
      this.prisma.referral.count({ where }),
      this.prisma.referral.count({ where: { ...where, status: "REWARDED" as const } }),
      this.prisma.referral.count({ where: { ...where, status: "PENDING" as const } }),
    ]);

    return {
      username,
      // Sellers' rewards land in their existing withdrawal balance, not a separate figure here.
      referralBalanceTmt: isSeller ? null : Number(user.referralBalanceTmt),
      // Nobody self-serves any more: the field stays so existing clients keep parsing, and it
      // stays false so none of them offer an editor the API would refuse.
      canChangeUsername: false,
      stats: { totalReferred, rewarded, pending },
    };
  }

  async listLedger() {
    const referrals = await this.prisma.referral.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        referrerUser: { select: { id: true, phone: true, fullName: true } },
        referrerSeller: { select: { id: true, handle: true, shopName: true } },
        refereeUser: { select: { id: true, phone: true, fullName: true } },
      },
    });

    return referrals.map((r) => ({
      id: r.id,
      referrerType: r.referrerType,
      referrer:
        r.referrerType === "SELLER"
          ? { id: r.referrerSeller?.id ?? null, label: r.referrerSeller ? `@${r.referrerSeller.handle}` : "—" }
          : { id: r.referrerUser?.id ?? null, label: r.referrerUser?.fullName || r.referrerUser?.phone || "—" },
      referee: { id: r.refereeUser.id, label: r.refereeUser.fullName || r.refereeUser.phone },
      username: r.username,
      status: r.status,
      rewardAmountTmt: r.rewardAmountTmt ? Number(r.rewardAmountTmt) : null,
      createdAt: r.createdAt.toISOString(),
      rewardedAt: r.rewardedAt ? r.rewardedAt.toISOString() : null,
      attribution: {
        utmSource: r.utmSource,
        utmMedium: r.utmMedium,
        utmCampaign: r.utmCampaign,
        referrerUrl: r.referrerUrl,
      },
    }));
  }

  async leaderboard(from: Date, to: Date) {
    const grouped = await this.prisma.referral.groupBy({
      by: ["referrerType", "referrerUserId", "referrerSellerId"],
      where: { status: "REWARDED", rewardedAt: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { rewardAmountTmt: true },
    });

    const sorted = grouped.sort((a, b) => b._count._all - a._count._all);
    const results: { referrerType: ReferrerType; label: string; count: number; totalRewardTmt: number }[] = [];

    for (const g of sorted) {
      let label = "—";
      if (g.referrerType === "SELLER" && g.referrerSellerId) {
        const seller = await this.prisma.seller.findUnique({
          where: { id: g.referrerSellerId },
          select: { handle: true, shopName: true },
        });
        label = seller ? `${seller.shopName} (@${seller.handle})` : "—";
      } else if (g.referrerType === "CUSTOMER" && g.referrerUserId) {
        const user = await this.prisma.user.findUnique({
          where: { id: g.referrerUserId },
          select: { fullName: true, phone: true },
        });
        label = user ? user.fullName || user.phone : "—";
      }
      results.push({
        referrerType: g.referrerType,
        label,
        count: g._count._all,
        totalRewardTmt: Number(g._sum.rewardAmountTmt ?? 0),
      });
    }

    return results;
  }
}
