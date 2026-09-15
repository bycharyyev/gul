import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { validateAttachment, type ChatAttachmentInput } from "../common/chat-attachment";
import type { SupportThreadStatus } from "@prisma/client";

/** A message may be text, or a file, or both -- but not neither. */
function assertNotBlank(body: string, attachmentUrl: string | null) {
  if (!body?.trim() && !attachmentUrl) throw new BadRequestException("SUPPORT_MESSAGE_EMPTY");
}

const THREAD_INCLUDE = {
  user: { select: { id: true, phone: true, fullName: true } },
} as const;

@Injectable()
export class SupportService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
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

  async getMyThread(userId: string, sellerId: string | null = null) {
    const thread = await this.getOrCreateThread(userId, sellerId);
    const messages = await this.prisma.supportMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
    });
    await this.prisma.supportMessage.updateMany({
      where: { threadId: thread.id, senderRole: { in: ["STAFF", "SELLER"] }, readByCustomer: false },
      data: { readByCustomer: true },
    });
    return { thread, messages };
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

  async getThreadForStaff(id: string) {
    const thread = await this.prisma.supportThread.findFirst({ where: { id, sellerId: null }, include: THREAD_INCLUDE });
    if (!thread) throw new NotFoundException("Thread not found");
    const messages = await this.markRead(id, "readByStaff");
    return { thread, messages };
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

  async getThreadForSeller(sellerId: string, id: string) {
    const thread = await this.prisma.supportThread.findFirst({ where: { id, sellerId }, include: THREAD_INCLUDE });
    if (!thread) throw new NotFoundException("Thread not found");
    const messages = await this.markRead(id, "readByStaff");
    return { thread, messages };
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

  private async markRead(threadId: string, field: "readByStaff") {
    const messages = await this.prisma.supportMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });
    await this.prisma.supportMessage.updateMany({
      where: { threadId, senderRole: "CUSTOMER", [field]: false },
      data: { [field]: true },
    });
    return messages;
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
    return message;
  }
}
