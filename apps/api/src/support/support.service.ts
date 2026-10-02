import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PushEventsService } from "../notifications/push-events.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { validateAttachment, type ChatAttachmentInput } from "../common/chat-attachment";
import type { SupportThreadStatus } from "@prisma/client";
import { afterCursor, INCREMENTAL_TAKE, parseAfter } from "../common/message-cursor";

/** A message may be text, or a file, or both -- but not neither. */
function assertNotBlank(body: string, attachmentUrl: string | null) {
  if (!body?.trim() && !attachmentUrl) throw new BadRequestException("SUPPORT_MESSAGE_EMPTY");
}

const THREAD_INCLUDE = {
  user: { select: { id: true, phone: true, email: true, fullName: true } },
} as const;

@Injectable()
export class SupportService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    @Optional() private push?: PushEventsService,
  ) {}

  private async getOrCreateThread(userId: string, sellerId: string | null) {
    const existing = await this.prisma.supportThread.findFirst({
      where: { userId, sellerId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;
    return this.prisma.supportThread.create({ data: { userId, sellerId } });
  }

  // ---- Customer: platform support (sellerId = null) or seller chat (sellerId set) ----

  async getMyThread(userId: string, sellerId: string | null = null, after?: string) {
    const thread = await this.getOrCreateThread(userId, sellerId);
    const { messages, incremental } = await this.readMessages(thread.id, after);
    // A poll that brought nothing from the other side has nothing to mark read -- skip the write
    // rather than issue it every few seconds for every open chat.
    if (!incremental || messages.some((m) => m.senderRole !== "CUSTOMER")) {
      await this.prisma.supportMessage.updateMany({
        where: { threadId: thread.id, senderRole: { in: ["STAFF", "SELLER"] }, readByCustomer: false },
        data: { readByCustomer: true },
      });
    }
    return { thread, messages, incremental };
  }

  /**
   * The whole thread, or with a valid `after` (a message id in *this* thread) only what came
   * later. An id from another thread resolves to nothing and falls back to the full read.
   */
  private async readMessages(threadId: string, after?: string) {
    const afterId = parseAfter(after);
    const cursor = afterId
      ? await this.prisma.supportMessage.findFirst({ where: { id: afterId, threadId }, select: { id: true, createdAt: true } })
      : null;
    if (!cursor) {
      const messages = await this.prisma.supportMessage.findMany({ where: { threadId }, orderBy: { createdAt: "asc" } });
      return { messages, incremental: false };
    }
    const messages = await this.prisma.supportMessage.findMany({
      where: { threadId, ...afterCursor(cursor) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: INCREMENTAL_TAKE,
    });
    return { messages, incremental: true };
  }

  async sendCustomerMessage(
    userId: string,
    body: string,
    sellerId: string | null = null,
    attachment?: ChatAttachmentInput | null,
  ) {
    const thread = await this.getOrCreateThread(userId, sellerId);
    const columns = validateAttachment(attachment, this.storage.publicBase);
    assertNotBlank(body, columns.attachmentUrl);
    const message = await this.prisma.supportMessage.create({
      data: { threadId: thread.id, senderRole: "CUSTOMER", authorId: userId, body: body.trim(), ...columns },
    });
    await this.prisma.supportThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date(), status: "OPEN" },
    });
    void this.push?.threadMessage(thread.id, true, body.trim(), columns.attachmentUrl);
    return message;
  }

  // ---- Staff: platform support only ----

  async listThreadsForStaff() {
    const threads = await this.prisma.supportThread.findMany({
      where: { sellerId: null },
      orderBy: { lastMessageAt: "desc" },
      include: THREAD_INCLUDE,
    });
    return this.withUnreadCounts(threads, "readByStaff");
  }

  async getThreadForStaff(id: string, after?: string) {
    const thread = await this.prisma.supportThread.findFirst({ where: { id, sellerId: null }, include: THREAD_INCLUDE });
    if (!thread) throw new NotFoundException("Thread not found");
    return { thread, ...(await this.markRead(id, "readByStaff", after)) };
  }

  async sendStaffMessage(threadId: string, authorId: string, body: string, attachment?: ChatAttachmentInput | null) {
    const thread = await this.prisma.supportThread.findFirst({ where: { id: threadId, sellerId: null } });
    if (!thread) throw new NotFoundException("Thread not found");
    return this.postReply(threadId, "STAFF", authorId, body, attachment);
  }

  async setThreadStatus(id: string, status: SupportThreadStatus) {
    const thread = await this.prisma.supportThread.findUnique({ where: { id } });
    if (!thread) throw new NotFoundException("Thread not found");
    return this.prisma.supportThread.update({ where: { id }, data: { status } });
  }

  // ---- Seller inbox ----

  async listThreadsForSeller(sellerId: string) {
    const threads = await this.prisma.supportThread.findMany({
      where: { sellerId },
      orderBy: { lastMessageAt: "desc" },
      include: THREAD_INCLUDE,
    });
    return this.withUnreadCounts(threads, "readByStaff");
  }

  async getThreadForSeller(sellerId: string, id: string, after?: string) {
    const thread = await this.prisma.supportThread.findFirst({ where: { id, sellerId }, include: THREAD_INCLUDE });
    if (!thread) throw new NotFoundException("Thread not found");
    return { thread, ...(await this.markRead(id, "readByStaff", after)) };
  }

  async sendSellerMessage(
    sellerId: string,
    threadId: string,
    authorId: string,
    body: string,
    attachment?: ChatAttachmentInput | null,
  ) {
    const thread = await this.prisma.supportThread.findFirst({ where: { id: threadId, sellerId } });
    if (!thread) throw new ForbiddenException("Not your conversation");
    return this.postReply(threadId, "SELLER", authorId, body, attachment);
  }

  async getUnreadCountForSeller(sellerId: string) {
    const count = await this.prisma.supportMessage.count({
      where: { senderRole: "CUSTOMER", readByStaff: false, thread: { sellerId } },
    });
    return { count };
  }

  // ---- Shared helpers ----

  private async withUnreadCounts(threads: { id: string }[], unreadField: "readByStaff") {
    const unreadCounts = await this.prisma.supportMessage.groupBy({
      by: ["threadId"],
      where: { senderRole: "CUSTOMER", [unreadField]: false },
      _count: { _all: true },
    });
    const unreadMap = new Map(unreadCounts.map((u) => [u.threadId, u._count._all]));
    return threads.map((t) => ({ ...t, unreadCount: unreadMap.get(t.id) ?? 0 }));
  }

  private async markRead(threadId: string, field: "readByStaff", after?: string) {
    const { messages, incremental } = await this.readMessages(threadId, after);
    if (!incremental || messages.some((m) => m.senderRole === "CUSTOMER")) {
      await this.prisma.supportMessage.updateMany({
        where: { threadId, senderRole: "CUSTOMER", [field]: false },
        data: { [field]: true },
      });
    }
    return { messages, incremental };
  }

  private async postReply(
    threadId: string,
    senderRole: "STAFF" | "SELLER",
    authorId: string,
    body: string,
    attachment?: ChatAttachmentInput | null,
  ) {
    const columns = validateAttachment(attachment, this.storage.publicBase);
    assertNotBlank(body, columns.attachmentUrl);
    const message = await this.prisma.supportMessage.create({
      data: { threadId, senderRole, authorId, body: body.trim(), ...columns },
    });
    await this.prisma.supportThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    });
    void this.push?.threadMessage(threadId, false, body.trim(), columns.attachmentUrl);
    return message;
  }
}
