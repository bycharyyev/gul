import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type SellerLedgerEntryType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type LedgerWrite = {
  sellerId: string;
  type: SellerLedgerEntryType;
  amountTmt: Prisma.Decimal | number | string;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class SellerLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  record(tx: Prisma.TransactionClient, write: LedgerWrite) {
    return tx.sellerLedgerEntry.create({ data: write });
  }

  async listForSeller(sellerId: string, take = 100) {
    const rows = await this.prisma.sellerLedgerEntry.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(take, 1), 500),
    });
    return rows.map((row) => ({ ...row, amountTmt: Number(row.amountTmt) }));
  }

  async listForUser(userId: string, take = 100) {
    const seller = await this.prisma.seller.findUnique({ where: { userId }, select: { id: true } });
    if (!seller) throw new NotFoundException("Seller profile not found");
    return this.listForSeller(seller.id, take);
  }

  /** Cached balance versus immutable evidence; mismatches require investigation, never auto-fixing. */
  async reconcile() {
    const rows = await this.prisma.$queryRaw<
      Array<{ sellerId: string; handle: string; cachedBalance: Prisma.Decimal; ledgerBalance: Prisma.Decimal }>
    >`
      SELECT s.id AS "sellerId", s.handle,
             s."balanceTmt" AS "cachedBalance",
             COALESCE(SUM(l."amountTmt"), 0) AS "ledgerBalance"
      FROM "Seller" s
      LEFT JOIN "SellerLedgerEntry" l ON l."sellerId" = s.id
      GROUP BY s.id, s.handle, s."balanceTmt"
      HAVING s."balanceTmt" <> COALESCE(SUM(l."amountTmt"), 0)
      ORDER BY s.handle
    `;
    return rows.map((row) => ({
      ...row,
      cachedBalance: Number(row.cachedBalance),
      ledgerBalance: Number(row.ledgerBalance),
      difference: Number(row.cachedBalance) - Number(row.ledgerBalance),
    }));
  }
}
