import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SellersService } from "../sellers/sellers.service";
import { TelegramBotService } from "../telegram-bot/telegram-bot.service";
import { EmailService } from "../email/email.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import type { CreateWithdrawalDto } from "./dto/create-withdrawal.dto";
import type { ReviewWithdrawalDto } from "./dto/review-withdrawal.dto";
import type { WithdrawalStatus } from "@prisma/client";
import { SellerLedgerService } from "../seller-ledger/seller-ledger.service";

const SELLER_SELECT = { id: true, handle: true, shopName: true } as const;

@Injectable()
export class WithdrawalsService {
  constructor(
    private prisma: PrismaService,
    private sellers: SellersService,
    private telegramBot: TelegramBotService,
    private email: EmailService,
    private auditLog: AuditLogService,
    private ledger: SellerLedgerService,
  ) {}

  async createRequest(userId: string, dto: CreateWithdrawalDto) {
    const sellerId = await this.sellers.requireSellerId(userId);

    // Atomic conditional decrement — avoids a race where two concurrent requests both pass a balance check.
    const request = await this.prisma.$transaction(async (tx) => {
      const result = await tx.seller.updateMany({
        where: { id: sellerId, balanceTmt: { gte: dto.amountTmt } },
        data: { balanceTmt: { decrement: dto.amountTmt } },
      });
      if (result.count === 0) {
        throw new BadRequestException("Недостаточно средств на балансе");
      }
      const created = await tx.withdrawalRequest.create({
        data: { sellerId, amountTmt: dto.amountTmt, payoutDetails: dto.payoutDetails },
      });
      await this.ledger.record(tx, {
        sellerId,
        type: "WITHDRAWAL_RESERVE",
        amountTmt: -dto.amountTmt,
        referenceType: "WithdrawalRequest",
        referenceId: created.id,
        idempotencyKey: `withdrawal:${created.id}:reserve`,
      });
      return created;
    });

    return request;
  }

  listMyRequests(userId: string) {
    return this.prisma.seller.findUnique({ where: { userId } }).then((seller) => {
      if (!seller) throw new NotFoundException("Seller profile not found");
      return this.prisma.withdrawalRequest.findMany({
        where: { sellerId: seller.id },
        orderBy: { createdAt: "desc" },
      });
    });
  }

  listAllRequests(status?: WithdrawalStatus) {
    return this.prisma.withdrawalRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: { seller: { select: SELLER_SELECT } },
    });
  }

  private async findRequestOrThrow(id: string) {
    const request = await this.prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Withdrawal request not found");
    return request;
  }

  async approveRequest(id: string, dto: ReviewWithdrawalDto, adminId: string) {
    const request = await this.findRequestOrThrow(id);

    // Claim the PENDING -> PAID transition atomically: a plain read-then-write here would let
    // two concurrent approve calls for the same request both pass the status check.
    const claimed = await this.prisma.withdrawalRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "PAID", reviewNote: dto.note, reviewedAt: new Date() },
    });
    if (claimed.count === 0) throw new BadRequestException("Заявка уже обработана");

    this.auditLog.record(adminId, "withdrawal.approve", "WithdrawalRequest", id, { amountTmt: request.amountTmt });
    // Money moved -- the seller should have a record of it in a channel they keep, not only a
    // chat message they may have never linked.
    void this.email.sendSellerPayout(request.sellerId, {
      id: request.id,
      amountTmt: request.amountTmt.toString(),
      note: dto.note,
    });
    void this.telegramBot.notifySeller(
      request.sellerId,
      `✅ Заявка на вывод ${request.amountTmt} TMT выплачена.${dto.note ? `\n${dto.note}` : ""}`,
    );
    return this.prisma.withdrawalRequest.findUniqueOrThrow({ where: { id } });
  }

  async rejectRequest(id: string, dto: ReviewWithdrawalDto, adminId: string) {
    const request = await this.findRequestOrThrow(id);

    // Same atomic-claim reasoning as approveRequest, plus the balance refund must land in the
    // same transaction as the claim -- otherwise two concurrent reject calls could both pass
    // the claim in sequence (each finding it PENDING before the other's write lands) and both
    // refund the seller.
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.withdrawalRequest.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "REJECTED", reviewNote: dto.note, reviewedAt: new Date() },
      });
      if (claimed.count === 0) throw new BadRequestException("Заявка уже обработана");

      await tx.seller.update({
        where: { id: request.sellerId },
        data: { balanceTmt: { increment: request.amountTmt } },
      });
      await this.ledger.record(tx, {
        sellerId: request.sellerId,
        type: "WITHDRAWAL_REFUND",
        amountTmt: request.amountTmt,
        referenceType: "WithdrawalRequest",
        referenceId: request.id,
        idempotencyKey: `withdrawal:${request.id}:refund`,
      });
      return tx.withdrawalRequest.findUniqueOrThrow({ where: { id } });
    });

    this.auditLog.record(adminId, "withdrawal.reject", "WithdrawalRequest", id, { amountTmt: request.amountTmt });
    void this.telegramBot.notifySeller(
      request.sellerId,
      `❌ Заявка на вывод ${request.amountTmt} TMT отклонена. Средства возвращены на баланс.${dto.note ? `\n${dto.note}` : ""}`,
    );
    return updated;
  }
}
