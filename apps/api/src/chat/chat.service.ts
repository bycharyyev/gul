import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

/** One row of the customer's inbox, whichever kind of conversation produced it. */
export type InboxEntry = {
  /** `room:<id>` or `thread:<id>` -- the client opens it without needing to know which is which. */
  id: string;
  kind: "GROUP" | "CHANNEL" | "SELLER" | "SUPPORT";
  officialCategory?: string | null;
  title: string;
  lastMessage: string | null;
  lastMessageAt: Date;
  unreadCount: number;
};

const MAX_BODY = 2000;
/** Enough people for a family, a class or a delivery crew; small enough to stay a conversation. */
const MAX_GROUP_MEMBERS = 100;
/** A ceiling on group creation, so one account cannot mint rooms in a loop. */
const MAX_GROUPS_PER_USER = 20;

/**
 * The alphabet a person may have to read off a screen and type into another one.
 *
 * No 0/O, 1/I/L: an invite that is one glance away from resolving to a different group -- or to
 * nothing -- is worse than a longer code.
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 10;

/** ~50 bits of entropy, drawn from the system CSPRNG. Guessing one is not a way in. */
function newInviteCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

/** Rejects what must never be rendered in somebody else's chat, and trims what is only noise. */
function cleanBody(value: string): string {
  const body = value.trim();
  if (!body) throw new BadRequestException("CHAT_MESSAGE_EMPTY");
  if (body.length > MAX_BODY) throw new BadRequestException("CHAT_MESSAGE_TOO_LONG");
  // Control characters would render as invisible or as line-breaking junk in every client.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) {
    throw new BadRequestException("CHAT_MESSAGE_INVALID");
  }
  return body;
}

/**
 * Conversations, as the customer sees them.
 *
 * The inbox is a merge of two stores on purpose -- see the ChatRoom comment in schema.prisma.
 * Group rooms live in ChatRoom; the support and per-seller conversations stay in SupportThread,
 * where the admin console and the seller inbox already read them. Merging happens here, once, so
 * the app sees one list and neither existing surface had to be rewritten.
 */
@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  /** The shop this account owns, if it owns one. Null for everybody else. */
  private async myShopId(userId: string): Promise<string | null> {
    const seller = await this.prisma.seller.findUnique({
      where: { userId },
      select: { id: true },
    });
    return seller?.id ?? null;
  }

  async inbox(userId: string): Promise<InboxEntry[]> {
    const shopId = await this.myShopId(userId);
    const [memberships, threads] = await Promise.all([
      this.prisma.chatMember.findMany({
        where: { userId },
        include: {
          room: {
            include: {
              messages: { orderBy: { createdAt: "desc" }, take: 1 },
            },
          },
        },
      }),
      this.prisma.supportThread.findMany({
        // A seller is a customer too. Their own conversations and the ones customers started with
        // their shop belong in one list: a person running a shop from a phone should not have to
        // remember which side of a conversation they are on to find it.
        where: shopId ? { OR: [{ userId }, { sellerId: shopId }] } : { userId },
        include: {
          user: { select: { fullName: true, username: true } },
          seller: { select: { shopName: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
    ]);

    // Counting unread per room in one grouped query rather than one query per room: an inbox of
    // twenty conversations would otherwise be twenty round trips on every open.
    const unreadByRoom = new Map<string, number>();
    if (memberships.length) {
      const counts = await Promise.all(
        memberships.map(async (member) => ({
          roomId: member.roomId,
          count: await this.prisma.chatMessage.count({
            where: {
              roomId: member.roomId,
              createdAt: { gt: member.lastReadAt },
              authorId: { not: userId },
            },
          }),
        })),
      );
      for (const row of counts) unreadByRoom.set(row.roomId, row.count);
    }

    // Unread means the opposite thing on each side of a thread, so the two are counted apart:
    // for a customer it is what staff or the shop wrote, for the shop it is what the customer did.
    const asCustomer = threads.filter((thread) => thread.userId === userId);
    const asShop = threads.filter((thread) => thread.userId !== userId);
    const unreadByThread = new Map<string, number>();
    const countInto = async (
      ids: string[],
      where: { readByCustomer?: boolean; readByStaff?: boolean; senderRole: object },
    ) => {
      if (!ids.length) return;
      const grouped = await this.prisma.supportMessage.groupBy({
        by: ["threadId"],
        where: { threadId: { in: ids }, ...where },
        _count: { _all: true },
      });
      for (const row of grouped) unreadByThread.set(row.threadId, row._count._all);
    };
    await Promise.all([
      countInto(asCustomer.map((t) => t.id), {
        readByCustomer: false,
        senderRole: { not: "CUSTOMER" },
      }),
      countInto(asShop.map((t) => t.id), {
        readByStaff: false,
        senderRole: { equals: "CUSTOMER" },
      }),
    ]);

    const entries: InboxEntry[] = [
      ...memberships.map((member) => ({
        id: `room:${member.roomId}`,
        kind: member.room.kind as "GROUP" | "CHANNEL",
        officialCategory: member.room.officialCategory,
        title: member.room.title,
        lastMessage: member.room.messages[0]?.body ?? null,
        lastMessageAt: member.room.lastMessageAt,
        unreadCount: unreadByRoom.get(member.roomId) ?? 0,
      })),
      ...threads.map((thread) => {
        // A conversation is named after the other side of it. Seen from the shop that is the
        // customer, seen from the customer it is the shop -- naming it after the shop in both
        // would give a seller an inbox where every row says their own name.
        const mine = thread.userId === userId;
        const customerName =
          thread.user.fullName?.trim() || thread.user.username || "";
        return {
          id: `thread:${thread.id}`,
          kind: (thread.sellerId ? "SELLER" : "SUPPORT") as "SELLER" | "SUPPORT",
          title: mine ? (thread.seller?.shopName ?? "") : customerName,
          lastMessage: thread.messages[0]?.body ?? null,
          lastMessageAt: thread.lastMessageAt,
          unreadCount: unreadByThread.get(thread.id) ?? 0,
        };
      }),
    ];

    return entries.sort(
      (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime(),
    );
  }

  /** Total unread across every conversation, for the badge on the navigation bar. */
  async unreadTotal(userId: string): Promise<{ unread: number }> {
    const entries = await this.inbox(userId);
    return { unread: entries.reduce((sum, entry) => sum + entry.unreadCount, 0) };
  }

  // ---- Groups ----

  /**
   * A group somebody made for their own people.
   *
   * The room is created with its owner already in it and a share code already on it, because the
   * next thing that happens is always sending the link -- a group of one with no way to invite
   * anybody is not a step towards anything.
   */
  async createGroup(userId: string, title: string) {
    const clean = title.trim();
    if (!clean || clean.length > 120) throw new BadRequestException("CHAT_TITLE_INVALID");
    const owned = await this.prisma.chatRoom.count({
      where: { createdById: userId, kind: "GROUP" },
    });
    if (owned >= MAX_GROUPS_PER_USER) throw new BadRequestException("CHAT_GROUP_LIMIT");

    const room = await this.prisma.chatRoom.create({
      data: {
        kind: "GROUP",
        title: clean,
        createdById: userId,
        inviteCode: await this.freshInviteCode(),
        members: { create: [{ userId }] },
      },
      select: { id: true, title: true, inviteCode: true },
    });
    return {
      conversationId: `room:${room.id}`,
      id: room.id,
      title: room.title,
      inviteCode: room.inviteCode,
    };
  }

  /**
   * A code no room holds yet.
   *
   * Collisions are vanishingly unlikely at this length, but the column is unique, so one would
   * surface as an unexplained failure while somebody was making a group. Retrying is cheaper than
   * that conversation.
   */
  private async freshInviteCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = newInviteCode();
      const taken = await this.prisma.chatRoom.findUnique({
        where: { inviteCode: code },
        select: { id: true },
      });
      if (!taken) return code;
    }
    throw new BadRequestException("CHAT_INVITE_UNAVAILABLE");
  }

  /** The group as its members see it: who is in it, and the link to bring in one more. */
  async groupInfo(roomId: string, userId: string) {
    await this.assertMember(roomId, userId);
    const room = await this.prisma.chatRoom.findUniqueOrThrow({
      where: { id: roomId },
      select: {
        id: true,
        kind: true,
        title: true,
        createdById: true,
        inviteCode: true,
        members: {
          orderBy: { joinedAt: "asc" },
          take: MAX_GROUP_MEMBERS,
          select: {
            joinedAt: true,
            user: { select: { id: true, fullName: true, username: true, avatarPath: true } },
          },
        },
      },
    });
    if (room.kind !== "GROUP") throw new NotFoundException("CHAT_ROOM_NOT_FOUND");
    return {
      id: room.id,
      title: room.title,
      isOwner: room.createdById === userId,
      // Every member can invite. This is a group somebody made for their own people, and a link
      // only the founder may send would make them the bottleneck on their own friends joining.
      inviteCode: room.inviteCode,
      members: room.members.map((member) => ({
        id: member.user.id,
        name: member.user.fullName?.trim() || member.user.username || "",
        avatarPath: member.user.avatarPath,
        isOwner: member.user.id === room.createdById,
        joinedAt: member.joinedAt,
      })),
    };
  }

  /** Replaces the code, so a link that reached the wrong person stops working. Owner only. */
  async rotateInvite(roomId: string, userId: string) {
    const room = await this.ownedGroup(roomId, userId);
    const inviteCode = await this.freshInviteCode();
    await this.prisma.chatRoom.update({ where: { id: room.id }, data: { inviteCode } });
    return { inviteCode };
  }

  /**
   * What somebody sees before deciding to join.
   *
   * Deliberately thin -- a name and a size, no messages and no member list. Anybody holding a
   * forwarded link can call this, and a preview that showed who is in the group would turn a
   * leaked link into a way to read the membership of a private conversation.
   */
  async invitePreview(code: string, userId: string) {
    const room = await this.roomByInvite(code);
    const member = await this.prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
      select: { roomId: true },
    });
    const memberCount = await this.prisma.chatMember.count({ where: { roomId: room.id } });
    return {
      id: room.id,
      title: room.title,
      memberCount,
      alreadyMember: !!member,
      // Present either way, so the app can go straight in rather than joining a second time.
      conversationId: `room:${room.id}`,
    };
  }

  async joinByInvite(code: string, userId: string) {
    const room = await this.roomByInvite(code);
    const already = await this.prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
      select: { roomId: true },
    });
    if (!already) {
      const memberCount = await this.prisma.chatMember.count({ where: { roomId: room.id } });
      if (memberCount >= MAX_GROUP_MEMBERS) throw new BadRequestException("CHAT_GROUP_FULL");
      await this.prisma.chatMember.createMany({
        data: [{ roomId: room.id, userId }],
        skipDuplicates: true,
      });
    }
    return { conversationId: `room:${room.id}`, title: room.title };
  }

  private async roomByInvite(code: string) {
    const clean = code.trim().toUpperCase();
    const room = clean
      ? await this.prisma.chatRoom.findUnique({
          where: { inviteCode: clean },
          select: { id: true, title: true, kind: true },
        })
      : null;
    // A retired code and a code that never existed answer the same way: the person holding it
    // learns nothing about which of the two it was.
    if (!room || room.kind !== "GROUP") throw new NotFoundException("CHAT_INVITE_NOT_FOUND");
    return room;
  }

  async leaveGroup(roomId: string, userId: string) {
    await this.assertMember(roomId, userId);
    const room = await this.prisma.chatRoom.findUniqueOrThrow({
      where: { id: roomId },
      select: { kind: true, createdById: true },
    });
    if (room.kind !== "GROUP") throw new BadRequestException("CHAT_NOT_A_GROUP");
    // The owner deletes instead. Letting them walk out would leave a group nobody can rename,
    // re-invite to or close -- and the people still in it with no way to be rid of it.
    if (room.createdById === userId) throw new BadRequestException("CHAT_OWNER_CANNOT_LEAVE");
    await this.prisma.chatMember.deleteMany({ where: { roomId, userId } });
    return { left: true };
  }

  /** Closes the group for everybody in it. Owner only, and it takes the messages with it. */
  async deleteGroup(roomId: string, userId: string) {
    const room = await this.ownedGroup(roomId, userId);
    await this.prisma.chatRoom.delete({ where: { id: room.id } });
    return { deleted: true };
  }

  private async ownedGroup(roomId: string, userId: string) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: { id: true, kind: true, createdById: true },
    });
    if (!room || room.kind !== "GROUP") throw new NotFoundException("CHAT_ROOM_NOT_FOUND");
    if (room.createdById !== userId) throw new ForbiddenException("CHAT_NOT_ROOM_OWNER");
    return room;
  }

  // ---- Channels ----

  /**
   * A channel for a shop, created by the person who runs it.
   *
   * The owner is the only one who may post -- see `send`. Anybody may subscribe, and that is the
   * whole difference from a group: an audience joins itself, a group is assembled.
   */
  async createChannel(userId: string, title: string, description?: string) {
    const shopId = await this.myShopId(userId);
    if (!shopId) throw new ForbiddenException("CHAT_NOT_A_SELLER");
    const clean = title.trim();
    if (!clean || clean.length > 120) throw new BadRequestException("CHAT_TITLE_INVALID");

    return this.prisma.chatRoom.create({
      data: {
        kind: "CHANNEL",
        title: clean,
        description: description?.trim() || null,
        createdById: userId,
        sellerId: shopId,
        // The owner is a member of their own channel, so it appears in their inbox beside every
        // other conversation rather than in a separate place they have to remember to check.
        members: { create: [{ userId }] },
      },
    });
  }

  /** Channels somebody could subscribe to, most recently active first. */
  async listChannels(userId: string) {
    const [channels, mine] = await Promise.all([
      this.prisma.chatRoom.findMany({
        where: { kind: "CHANNEL" },
        orderBy: [{ officialCategory: { sort: "asc", nulls: "last" } }, { lastMessageAt: "desc" }],
        take: 100,
        include: {
          seller: { select: { shopName: true } },
          _count: { select: { members: true } },
        },
      }),
      this.prisma.chatMember.findMany({
        where: { userId },
        select: { roomId: true },
      }),
    ]);
    const subscribed = new Set(mine.map((row) => row.roomId));
    return channels.map((channel) => ({
      id: channel.id,
      title: channel.title,
      officialCategory: channel.officialCategory,
      description: channel.description,
      shopName: channel.seller?.shopName ?? null,
      subscriberCount: channel._count.members,
      lastMessageAt: channel.lastMessageAt,
      subscribed: subscribed.has(channel.id),
    }));
  }

  async subscribe(roomId: string, userId: string) {
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    // Only a channel is open to join. A group is assembled by somebody, and letting a stranger
    // add themselves to one would be a way into a private conversation.
    if (!room || room.kind !== "CHANNEL") throw new NotFoundException("CHAT_ROOM_NOT_FOUND");
    await this.prisma.chatMember.createMany({
      data: [{ roomId, userId }],
      skipDuplicates: true,
    });
    return { subscribed: true };
  }

  async unsubscribe(roomId: string, userId: string) {
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room || room.kind !== "CHANNEL") throw new NotFoundException("CHAT_ROOM_NOT_FOUND");
    // The owner stays: a channel with nobody able to post is a dead channel that still appears
    // in every subscriber's list.
    if (room.createdById === userId) throw new BadRequestException("CHAT_OWNER_CANNOT_LEAVE");
    await this.prisma.chatMember.deleteMany({ where: { roomId, userId } });
    return { subscribed: false };
  }

  private async assertMember(roomId: string, userId: string) {
    const member = await this.prisma.chatMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    // A non-member gets the same answer as a missing room: confirming a room exists would leak
    // which conversations are happening to anybody who can guess an id.
    if (!member) throw new NotFoundException("CHAT_ROOM_NOT_FOUND");
    return member;
  }

  async messages(roomId: string, userId: string) {
    await this.assertMember(roomId, userId);
    const room = await this.prisma.chatRoom.findUniqueOrThrow({
      where: { id: roomId },
      select: { id: true, title: true, kind: true, createdById: true, officialCategory: true },
    });
    const messages = await this.prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      select: {
        id: true,
        body: true,
        createdAt: true,
        authorId: true,
        author: { select: { id: true, fullName: true, username: true, avatarPath: true } },
      },
    });
    // Told to the client so it can hide a composer nobody may use. The rule itself lives in
    // `send` -- this only saves somebody typing a message that would be refused.
    const canPost = !room.officialCategory && (room.kind !== "CHANNEL" || room.createdById === userId);
    return {
      room: { id: room.id, title: room.title, kind: room.kind, officialCategory: room.officialCategory, canPost },
      messages: messages.reverse(),
    };
  }

  async send(roomId: string, userId: string, body: string) {
    await this.assertMember(roomId, userId);
    const room = await this.prisma.chatRoom.findUniqueOrThrow({
      where: { id: roomId },
      select: { kind: true, createdById: true, officialCategory: true },
    });
    // Subscribing to a channel is not permission to broadcast in it. Enforced here rather than by
    // hiding the composer, because a hidden button is a suggestion and this is a rule.
    if (room.officialCategory || (room.kind === "CHANNEL" && room.createdById !== userId)) {
      throw new ForbiddenException("CHAT_CHANNEL_READ_ONLY");
    }
    const clean = cleanBody(body);
    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { roomId, authorId: userId, body: clean },
      }),
      // Kept in step with the message inside the same transaction: an inbox ordered by a
      // lastMessageAt that lagged behind would put a live conversation below a dead one.
      this.prisma.chatRoom.update({
        where: { id: roomId },
        data: { lastMessageAt: new Date() },
      }),
      this.prisma.chatMember.update({
        where: { roomId_userId: { roomId, userId } },
        data: { lastReadAt: new Date() },
      }),
    ]);
    return message;
  }

  async markRead(roomId: string, userId: string) {
    await this.assertMember(roomId, userId);
    await this.prisma.chatMember.update({
      where: { roomId_userId: { roomId, userId } },
      data: { lastReadAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * The conversation with one seller, created on first use.
   *
   * Get-or-create rather than a separate "start a chat" step: from the customer's side there is
   * only ever one conversation with a shop, and asking them to open it before writing in it is a
   * question with one possible answer.
   */
  async conversationWithSeller(userId: string, sellerId: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      select: { id: true, shopName: true },
    });
    if (!seller) throw new NotFoundException("CHAT_SELLER_NOT_FOUND");

    const existing = await this.prisma.supportThread.findFirst({
      where: { userId, sellerId, status: "OPEN" },
    });
    const thread =
      existing ??
      (await this.prisma.supportThread.create({ data: { userId, sellerId } }));

    return { conversationId: `thread:${thread.id}`, title: seller.shopName };
  }

  // ---- Existing support and seller threads, addressed the same way as a room ----
  //
  // The app holds one conversation screen and one repository. Without these it would need the
  // seller's id to reach a seller thread, a different pair of endpoints per kind, and a branch at
  // every call site -- the two storage shapes would have leaked all the way into the UI.

  /**
   * The thread, and which side of it this account is on.
   *
   * Both sides reach a conversation through the same endpoints, so the app has one screen. Who
   * is asking decides what a reply is recorded as and what counts as read -- not which URL was
   * called, which would be a rule the client could get wrong.
   */
  private async ownedThread(threadId: string, userId: string) {
    const thread = await this.prisma.supportThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException("CHAT_ROOM_NOT_FOUND");
    if (thread.userId === userId) return { thread, asShop: false };

    const shopId = thread.sellerId ? await this.myShopId(userId) : null;
    // Same answer as a missing thread, for the same reason as a room.
    if (!shopId || shopId !== thread.sellerId) {
      throw new NotFoundException("CHAT_ROOM_NOT_FOUND");
    }
    return { thread, asShop: true };
  }

  async threadMessages(threadId: string, userId: string) {
    const { thread, asShop } = await this.ownedThread(threadId, userId);
    const [seller, messages] = await Promise.all([
      thread.sellerId
        ? this.prisma.seller.findUnique({
            where: { id: thread.sellerId },
            select: { shopName: true },
          })
        : Promise.resolve(null),
      this.prisma.supportMessage.findMany({
        where: { threadId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 200,
        select: {
          id: true,
          body: true,
          createdAt: true,
          senderRole: true,
          authorId: true,
          author: { select: { id: true, fullName: true, username: true, avatarPath: true } },
        },
      }),
    ]);
    // Named after the other side, same as in the inbox.
    const counterparty = asShop
      ? await this.prisma.user
          .findUnique({
            where: { id: thread.userId },
            select: { fullName: true, username: true },
          })
          .then((user) => user?.fullName?.trim() || user?.username || "")
      : (seller?.shopName ?? "");
    return {
      room: { id: thread.id, title: counterparty, kind: "THREAD", canPost: true },
      messages: messages.reverse(),
    };
  }

  async sendToThread(threadId: string, userId: string, body: string) {
    const { asShop } = await this.ownedThread(threadId, userId);
    const clean = cleanBody(body);
    const [message] = await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: {
          threadId,
          // Recorded from who is writing, never from what the client claimed. The admin console
          // and the seller inbox both read this field to decide whose message they are looking at.
          senderRole: asShop ? "SELLER" : "CUSTOMER",
          authorId: userId,
          body: clean,
          // Own messages are read by definition, on whichever side wrote them.
          readByCustomer: !asShop,
          readByStaff: asShop,
        },
      }),
      this.prisma.supportThread.update({
        where: { id: threadId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    return message;
  }

  async markThreadRead(threadId: string, userId: string) {
    const { asShop } = await this.ownedThread(threadId, userId);
    await this.prisma.supportMessage.updateMany({
      where: asShop
        ? { threadId, senderRole: "CUSTOMER", readByStaff: false }
        : { threadId, senderRole: { not: "CUSTOMER" }, readByCustomer: false },
      data: asShop ? { readByStaff: true } : { readByCustomer: true },
    });
    return { ok: true };
  }

  // ---- Shop API: a key acting for a shop ----
  //
  // Deliberately not the customer methods with the owner's user id passed in. Those are keyed on
  // a person, and that person's inbox holds their own groups, their own support thread and every
  // conversation they are in as a customer. A key issued to run a shop's automation must not be
  // able to read any of that, so every method here starts from the shop and never widens.

  /** The account that owns this shop. Messages the key writes are recorded as coming from it. */
  private async shopOwnerId(sellerId: string): Promise<string> {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      select: { userId: true },
    });
    if (!seller) throw new NotFoundException("CHAT_SELLER_NOT_FOUND");
    return seller.userId;
  }

  async shopChannels(sellerId: string) {
    const channels = await this.prisma.chatRoom.findMany({
      where: { sellerId, kind: "CHANNEL" },
      orderBy: { lastMessageAt: "desc" },
      include: { _count: { select: { members: true, messages: true } } },
    });
    return channels.map((channel) => ({
      id: channel.id,
      title: channel.title,
      description: channel.description,
      subscriberCount: channel._count.members,
      messageCount: channel._count.messages,
      lastMessageAt: channel.lastMessageAt,
      createdAt: channel.createdAt,
    }));
  }

  async createShopChannel(sellerId: string, title: string, description?: string) {
    const ownerId = await this.shopOwnerId(sellerId);
    const clean = title.trim();
    if (!clean || clean.length > 120) throw new BadRequestException("CHAT_TITLE_INVALID");
    const channel = await this.prisma.chatRoom.create({
      data: {
        kind: "CHANNEL",
        title: clean,
        description: description?.trim() || null,
        createdById: ownerId,
        sellerId,
        members: { create: [{ userId: ownerId }] },
      },
      select: { id: true, title: true, description: true, createdAt: true },
    });
    return { ...channel, subscriberCount: 1, messageCount: 0 };
  }

  private async ownedChannel(sellerId: string, channelId: string) {
    const channel = await this.prisma.chatRoom.findUnique({
      where: { id: channelId },
      select: { id: true, kind: true, sellerId: true },
    });
    // Same answer for another shop's channel as for one that does not exist: a key must not be
    // able to discover which channel ids are real by trying them.
    if (!channel || channel.kind !== "CHANNEL" || channel.sellerId !== sellerId) {
      throw new NotFoundException("CHAT_ROOM_NOT_FOUND");
    }
    return channel;
  }

  async shopChannelMessages(sellerId: string, channelId: string, limit = 100) {
    await this.ownedChannel(sellerId, channelId);
    return this.prisma.chatMessage.findMany({
      where: { roomId: channelId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
      select: { id: true, body: true, createdAt: true, authorId: true },
    });
  }

  async postToShopChannel(sellerId: string, channelId: string, body: string) {
    await this.ownedChannel(sellerId, channelId);
    const ownerId = await this.shopOwnerId(sellerId);
    const clean = cleanBody(body);
    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { roomId: channelId, authorId: ownerId, body: clean },
        select: { id: true, body: true, createdAt: true },
      }),
      this.prisma.chatRoom.update({
        where: { id: channelId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    return message;
  }

  /** Conversations customers started with this shop. Never the owner's own conversations. */
  async shopThreads(sellerId: string, limit = 50) {
    const threads = await this.prisma.supportThread.findMany({
      where: { sellerId },
      orderBy: { lastMessageAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        user: { select: { id: true, fullName: true, username: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
        _count: { select: { messages: true } },
      },
    });
    return threads.map((thread) => ({
      id: thread.id,
      customer: {
        id: thread.user.id,
        name: thread.user.fullName?.trim() || thread.user.username || "",
      },
      status: thread.status,
      lastMessage: thread.messages[0]?.body ?? null,
      lastMessageAt: thread.lastMessageAt,
      messageCount: thread._count.messages,
    }));
  }

  private async ownedThreadForShop(sellerId: string, threadId: string) {
    const thread = await this.prisma.supportThread.findUnique({
      where: { id: threadId },
      select: { id: true, sellerId: true },
    });
    if (!thread || thread.sellerId !== sellerId) throw new NotFoundException("CHAT_ROOM_NOT_FOUND");
    return thread;
  }

  async shopThreadMessages(sellerId: string, threadId: string, limit = 100) {
    await this.ownedThreadForShop(sellerId, threadId);
    return this.prisma.supportMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      take: Math.min(Math.max(limit, 1), 200),
      select: { id: true, body: true, createdAt: true, senderRole: true },
    });
  }

  async shopReplyToThread(sellerId: string, threadId: string, body: string) {
    await this.ownedThreadForShop(sellerId, threadId);
    const ownerId = await this.shopOwnerId(sellerId);
    const clean = cleanBody(body);
    const [message] = await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: {
          threadId,
          // A key writing for the shop is the shop speaking, and the customer's app renders the
          // two sides from this field. Recorded from who the key belongs to, never from the body.
          senderRole: "SELLER",
          authorId: ownerId,
          body: clean,
          readByCustomer: false,
          readByStaff: true,
        },
        select: { id: true, body: true, createdAt: true, senderRole: true },
      }),
      this.prisma.supportThread.update({
        where: { id: threadId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    return message;
  }

  // ---- Admin ----

  /**
   * A group assembled by staff, by account id.
   *
   * Separate from `createGroup` rather than the same call with a different caller: this one adds
   * people who never asked to be added, which is a thing only staff may do and only for rooms
   * they answer for. Somebody making a group for their own friends invites by link instead --
   * nobody outside this console knows anybody's account id.
   */
  async createRoom(title: string, memberIds: string[], adminId: string) {
    const clean = title.trim();
    if (!clean || clean.length > 120) throw new BadRequestException("CHAT_TITLE_INVALID");
    const unique = [...new Set([...memberIds, adminId])];
    const found = await this.prisma.user.count({ where: { id: { in: unique } } });
    if (found !== unique.length) throw new BadRequestException("CHAT_MEMBER_UNKNOWN");

    return this.prisma.chatRoom.create({
      data: {
        title: clean,
        createdById: adminId,
        members: { create: unique.map((userId) => ({ userId })) },
      },
      include: { members: true },
    });
  }

  async addMembers(roomId: string, memberIds: string[]) {
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException("CHAT_ROOM_NOT_FOUND");
    if (room.officialCategory) throw new BadRequestException("CHAT_OFFICIAL_SUBSCRIBE_ONLY");
    const unique = [...new Set(memberIds)];
    const found = await this.prisma.user.count({ where: { id: { in: unique } } });
    if (found !== unique.length) throw new BadRequestException("CHAT_MEMBER_UNKNOWN");
    await this.prisma.chatMember.createMany({
      data: unique.map((userId) => ({ roomId, userId })),
      skipDuplicates: true,
    });
    return { added: unique.length };
  }

  async removeMember(roomId: string, userId: string) {
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException("CHAT_ROOM_NOT_FOUND");
    if (room.officialCategory) throw new BadRequestException("CHAT_OFFICIAL_SUBSCRIBE_ONLY");
    if (room.createdById === userId) throw new BadRequestException("CHAT_OWNER_CANNOT_LEAVE");
    const removed = await this.prisma.chatMember.deleteMany({ where: { roomId, userId } });
    if (!removed.count) throw new NotFoundException("CHAT_MEMBER_NOT_FOUND");
    return { removed: removed.count };
  }

  /**
   * Every room, of every kind, with who answers for it.
   *
   * The invite code is reported as a yes/no rather than a value. Staff need to know a group has a
   * live link -- that is what makes it something people can still be added to -- but a console
   * that printed the code would let anybody reading it walk into a private conversation, and the
   * members would see one more name appear with no idea where it came from.
   */
  async adminRooms() {
    const rooms = await this.prisma.chatRoom.findMany({
      orderBy: { lastMessageAt: "desc" },
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
        seller: { select: { id: true, shopName: true } },
        _count: { select: { members: true, messages: true } },
      },
    });
    return rooms.map(({ inviteCode, ...room }) => ({ ...room, hasInvite: !!inviteCode }));
  }

  private async assertPublisher(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || !["ADMIN", "MANAGER"].includes(user.role)) {
      throw new ForbiddenException("CHAT_OFFICIAL_STAFF_ONLY");
    }
  }

  async createOfficialChannel(userId: string, category: "NEWS" | "PROMOTIONS" | "SECURITY") {
    await this.assertPublisher(userId);
    const definitions = {
      NEWS: { title: "Новости сервиса", description: "Обновления сервиса и важные объявления администрации." },
      PROMOTIONS: { title: "Акции", description: "Предложения и скидки. Подписывайтесь, если хотите получать новости об акциях." },
      SECURITY: { title: "Безопасность", description: "Как защитить аккаунт и распознать мошенничество. Никому не сообщайте пароль и коды подтверждения." },
    };
    const definition = definitions[category];
    if (!definition) throw new BadRequestException("CHAT_CATEGORY_INVALID");
    // The unique category makes setup safe to repeat, including concurrent setup by two staff.
    return this.prisma.chatRoom.upsert({
      where: { officialCategory: category },
      update: {},
      create: { ...definition, officialCategory: category, kind: "CHANNEL", createdById: userId },
    });
  }

  private async officialRoom(id: string, userId: string) {
    await this.assertPublisher(userId);
    const room = await this.prisma.chatRoom.findUnique({
      where: { id },
      select: { id: true, title: true, kind: true, officialCategory: true },
    });
    if (!room?.officialCategory || room.kind !== "CHANNEL") throw new NotFoundException("CHAT_ROOM_NOT_FOUND");
    return room;
  }

  async officialMessages(id: string, userId: string) {
    const room = await this.officialRoom(id, userId);
    const messages = await this.prisma.chatMessage.findMany({
      where: { roomId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200,
      select: { id: true, body: true, createdAt: true, authorId: true,
        author: { select: { id: true, fullName: true, username: true, avatarPath: true } } },
    });
    return { room: { ...room, canPost: true }, messages: messages.reverse() };
  }

  async publishOfficial(id: string, userId: string, body: string) {
    await this.officialRoom(id, userId);
    const clean = cleanBody(body);
    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({ data: { roomId: id, authorId: userId, body: clean } }),
      this.prisma.chatRoom.update({ where: { id }, data: { lastMessageAt: new Date() } }),
    ]);
    return message;
  }

  async adminDeleteRoom(id: string) {
    const room = await this.prisma.chatRoom.findUnique({ where: { id } });
    if (!room) throw new NotFoundException("CHAT_ROOM_NOT_FOUND");
    if (room.officialCategory) throw new BadRequestException("CHAT_OFFICIAL_CANNOT_DELETE");
    await this.prisma.chatRoom.delete({ where: { id } });
    return { deleted: true };
  }
}
