import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ChatService } from "./chat.service";

function target(prisma: Record<string, unknown>) {
  return new ChatService(prisma as never);
}

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 9, 12, minutes));

describe("ChatService", () => {
  describe("inbox", () => {
    it("merges group rooms and existing threads into one list, newest first", async () => {
      // The whole point of the merge: the customer sees conversations, not two storage shapes.
      const prisma = {
        chatMember: {
          findMany: jest.fn().mockResolvedValue([
            {
              roomId: "r1",
              lastReadAt: at(0),
              room: {
                kind: "GROUP",
                title: "Оптовики",
                lastMessageAt: at(10),
                messages: [{ body: "привет" }],
              },
            },
          ]),
        },
        supportThread: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "t1",
              userId: "u1",
              sellerId: "s1",
              lastMessageAt: at(20),
              user: { fullName: "Jemsh", username: "jemsh" },
              seller: { shopName: "Гульбахар" },
              messages: [{ body: "букет готов" }],
            },
            {
              id: "t2",
              userId: "u1",
              sellerId: null,
              lastMessageAt: at(5),
              user: { fullName: "Jemsh", username: "jemsh" },
              seller: null,
              messages: [],
            },
          ]),
        },
        chatMessage: { count: jest.fn().mockResolvedValue(2) },
        supportMessage: {
          groupBy: jest.fn().mockResolvedValue([{ threadId: "t1", _count: { _all: 3 } }]),
        },
        seller: { findUnique: jest.fn().mockResolvedValue(null) },
      };

      const inbox = await target(prisma).inbox("u1");

      expect(inbox.map((entry) => [entry.id, entry.kind, entry.unreadCount])).toEqual([
        ["thread:t1", "SELLER", 3],
        ["room:r1", "GROUP", 2],
        ["thread:t2", "SUPPORT", 0],
      ]);
      expect(inbox[0].title).toBe("Гульбахар");
    });

    it("does not count the customer's own messages as unread", async () => {
      const count = jest.fn().mockResolvedValue(0);
      const prisma = {
        chatMember: {
          findMany: jest.fn().mockResolvedValue([
            {
              roomId: "r1",
              lastReadAt: at(0),
              room: { kind: "GROUP", title: "X", lastMessageAt: at(1), messages: [] },
            },
          ]),
        },
        supportThread: { findMany: jest.fn().mockResolvedValue([]) },
        chatMessage: { count },
        supportMessage: { groupBy: jest.fn() },
        seller: { findUnique: jest.fn().mockResolvedValue(null) },
      };

      await target(prisma).inbox("u1");

      expect(count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ authorId: { not: "u1" } }),
        }),
      );
    });

    it("asks the database nothing about unread when there is nothing to ask about", async () => {
      const groupBy = jest.fn();
      const prisma = {
        chatMember: { findMany: jest.fn().mockResolvedValue([]) },
        supportThread: { findMany: jest.fn().mockResolvedValue([]) },
        chatMessage: { count: jest.fn() },
        supportMessage: { groupBy },
        seller: { findUnique: jest.fn().mockResolvedValue(null) },
      };

      await expect(target(prisma).inbox("u1")).resolves.toEqual([]);
      expect(groupBy).not.toHaveBeenCalled();
    });
  });

  describe("access", () => {
    it("answers a non-member exactly as it answers a missing room", async () => {
      // A 403 here would confirm the room exists to anybody who can guess an id, which is a list
      // of who is talking to whom.
      const prisma = { chatMember: { findUnique: jest.fn().mockResolvedValue(null) } };

      await expect(target(prisma).messages("r1", "outsider")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(target(prisma).send("r1", "outsider", "hi")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(target(prisma).markRead("r1", "outsider")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("send", () => {
    const member = { roomId: "r1", userId: "u1", lastReadAt: at(0) };

    function sendPrisma() {
      return {
        chatMember: { findUnique: jest.fn().mockResolvedValue(member), update: jest.fn() },
        chatMessage: { create: jest.fn() },
        chatRoom: {
          update: jest.fn(),
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ kind: "GROUP", createdById: "someone" }),
        },
        $transaction: jest.fn().mockResolvedValue([{ id: "m1" }]),
      };
    }

    it("writes the message and the room's ordering timestamp in one transaction", async () => {
      // Separately, an inbox ordered by a lagging lastMessageAt would sink a live conversation
      // below a dead one for as long as the second write took.
      const prisma = sendPrisma();
      await target(prisma).send("r1", "u1", "  привет  ");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ body: "привет" }) }),
      );
      expect(prisma.chatRoom.update).toHaveBeenCalled();
    });

    it.each([
      ["an empty message", "   "],
      ["control characters", "bad\u0000message"],
      ["a message longer than the column", "x".repeat(2001)],
    ])("refuses %s", async (_label, body) => {
      await expect(target(sendPrisma()).send("r1", "u1", body)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe("channels", () => {
    const member = { roomId: "c1", userId: "owner", lastReadAt: at(0) };

    function channelPrisma(room: Record<string, unknown>) {
      return {
        chatMember: { findUnique: jest.fn().mockResolvedValue(member), update: jest.fn() },
        chatRoom: { findUnique: jest.fn().mockResolvedValue(room), findUniqueOrThrow: jest.fn().mockResolvedValue(room), update: jest.fn(), create: jest.fn() },
        chatMessage: { create: jest.fn() },
        seller: { findUnique: jest.fn().mockResolvedValue({ id: "s1" }) },
        $transaction: jest.fn().mockResolvedValue([{ id: "m1" }]),
      };
    }

    it("lets the owner post", async () => {
      const prisma = channelPrisma({ kind: "CHANNEL", createdById: "owner" });
      await expect(target(prisma).send("c1", "owner", "новинка")).resolves.toBeDefined();
    });

    it("refuses a subscriber who tries to post", async () => {
      // Subscribing is not permission to broadcast. Enforced on the server, not by hiding the
      // composer: a hidden button is a suggestion and this is a rule.
      const prisma = channelPrisma({ kind: "CHANNEL", createdById: "owner" });
      prisma.chatMember.findUnique = jest
        .fn()
        .mockResolvedValue({ roomId: "c1", userId: "reader", lastReadAt: at(0) });

      await expect(target(prisma).send("c1", "reader", "спам")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("still lets any member post in a group", async () => {
      const prisma = channelPrisma({ kind: "GROUP", createdById: "someone" });
      await expect(target(prisma).send("c1", "owner", "привет")).resolves.toBeDefined();
    });

    it("refuses to let a stranger subscribe themselves into a group", async () => {
      // A group is assembled by somebody. Self-joining one would be a way into a private
      // conversation for anybody who can guess an id.
      const prisma = channelPrisma({ kind: "GROUP", createdById: "someone" });
      await expect(target(prisma).subscribe("c1", "stranger")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("keeps the owner in their own channel", async () => {
      // A channel nobody can post in is dead and still sits in every subscriber's list.
      const prisma = channelPrisma({ kind: "CHANNEL", createdById: "owner" });
      await expect(target(prisma).unsubscribe("c1", "owner")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("refuses to create a channel for somebody with no shop", async () => {
      const prisma = { seller: { findUnique: jest.fn().mockResolvedValue(null) } };
      await expect(
        target(prisma).createChannel("u1", "Новинки"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("puts the owner in their own channel at creation", async () => {
      const create = jest.fn().mockResolvedValue({});
      const prisma = {
        seller: { findUnique: jest.fn().mockResolvedValue({ id: "s1" }) },
        chatRoom: { create },
      };

      await target(prisma).createChannel("owner", "  Новинки  ", " каждый день ");

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "CHANNEL",
            title: "Новинки",
            description: "каждый день",
            sellerId: "s1",
            members: { create: [{ userId: "owner" }] },
          }),
        }),
      );
    });
  });

  describe("the shop side of a thread", () => {
    const thread = { id: "t1", userId: "customer", sellerId: "s1" };

    function shopPrisma() {
      return {
        supportThread: { findUnique: jest.fn().mockResolvedValue(thread), update: jest.fn() },
        seller: { findUnique: jest.fn().mockResolvedValue({ id: "s1" }) },
        supportMessage: { create: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
        user: { findUnique: jest.fn().mockResolvedValue({ fullName: "Jemsh", username: "jemsh" }) },
        $transaction: jest.fn().mockResolvedValue([{ id: "m1" }]),
      };
    }

    it("records a shop's reply as SELLER, from who is writing rather than what was claimed", async () => {
      // The admin console and the seller inbox both read senderRole to decide whose message they
      // are looking at. Taking it from the request would let either side write as the other.
      const prisma = shopPrisma();
      await target(prisma).sendToThread("t1", "shopOwner", "готово");

      expect(prisma.supportMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ senderRole: "SELLER", readByStaff: true, readByCustomer: false }),
        }),
      );
    });

    it("records the customer's own message as CUSTOMER", async () => {
      const prisma = shopPrisma();
      await target(prisma).sendToThread("t1", "customer", "здравствуйте");

      expect(prisma.supportMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ senderRole: "CUSTOMER", readByCustomer: true, readByStaff: false }),
        }),
      );
    });

    it("marks read the messages from the other side, whichever side is reading", async () => {
      const shop = shopPrisma();
      await target(shop).markThreadRead("t1", "shopOwner");
      expect(shop.supportMessage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { threadId: "t1", senderRole: "CUSTOMER", readByStaff: false },
        }),
      );

      const customer = shopPrisma();
      await target(customer).markThreadRead("t1", "customer");
      expect(customer.supportMessage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { threadId: "t1", senderRole: { not: "CUSTOMER" }, readByCustomer: false },
        }),
      );
    });

    it("refuses a shop that does not own the thread", async () => {
      const prisma = shopPrisma();
      prisma.seller.findUnique = jest.fn().mockResolvedValue({ id: "someone-else" });

      await expect(target(prisma).sendToThread("t1", "otherShop", "hi")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("refuses a stranger who owns no shop at all", async () => {
      const prisma = shopPrisma();
      prisma.seller.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        target(prisma).threadMessages("t1", "stranger"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("conversationWithSeller", () => {
    it("reuses the open conversation instead of starting a second one", async () => {
      // One shop, one conversation. A second thread would split the history in half and leave
      // half of it unreachable from the inbox.
      const create = jest.fn();
      const prisma = {
        seller: { findUnique: jest.fn().mockResolvedValue({ id: "s1", shopName: "Гульбахар" }) },
        supportThread: { findFirst: jest.fn().mockResolvedValue({ id: "t1" }), create },
      };

      await expect(target(prisma).conversationWithSeller("u1", "s1")).resolves.toEqual({
        conversationId: "thread:t1",
        title: "Гульбахар",
      });
      expect(create).not.toHaveBeenCalled();
    });

    it("creates one the first time somebody writes to a shop", async () => {
      const prisma = {
        seller: { findUnique: jest.fn().mockResolvedValue({ id: "s1", shopName: "Гульбахар" }) },
        supportThread: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: "t2" }),
        },
      };

      await expect(target(prisma).conversationWithSeller("u1", "s1")).resolves.toMatchObject({
        conversationId: "thread:t2",
      });
    });

    it("refuses a shop that does not exist", async () => {
      const prisma = { seller: { findUnique: jest.fn().mockResolvedValue(null) } };
      await expect(
        target(prisma).conversationWithSeller("u1", "ghost"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("groups", () => {
    const roomWith = (over: Record<string, unknown> = {}) => ({
      id: "g1",
      kind: "GROUP",
      title: "Друзья",
      createdById: "u1",
      inviteCode: "ABCDEFGHJK",
      members: [],
      ...over,
    });

    it("creates the group with its maker already in it and a code already on it", async () => {
      // Both at once on purpose: the next thing that happens is sending the link, and a group of
      // one with no way to invite anybody is not a step towards anything.
      const create = jest.fn().mockResolvedValue({ id: "g1", title: "Друзья", inviteCode: "X" });
      const prisma = {
        chatRoom: {
          count: jest.fn().mockResolvedValue(0),
          findUnique: jest.fn().mockResolvedValue(null),
          create,
        },
      };

      const made = await target(prisma).createGroup("u1", "  Друзья  ");

      const data = create.mock.calls[0][0].data;
      expect(data.title).toBe("Друзья");
      expect(data.kind).toBe("GROUP");
      expect(data.members.create).toEqual([{ userId: "u1" }]);
      expect(data.inviteCode).toHaveLength(10);
      expect(made.conversationId).toBe("room:g1");
    });

    it("draws a code from an alphabet with no lookalike characters", async () => {
      const create = jest.fn().mockResolvedValue({ id: "g1", title: "X", inviteCode: "X" });
      const prisma = {
        chatRoom: {
          count: jest.fn().mockResolvedValue(0),
          findUnique: jest.fn().mockResolvedValue(null),
          create,
        },
      };

      await target(prisma).createGroup("u1", "X");

      // A code somebody has to read off one screen and type into another must not be one glance
      // away from resolving to a different group.
      expect(create.mock.calls[0][0].data.inviteCode).toMatch(
        /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/,
      );
    });

    it("retries when a generated code is already taken", async () => {
      const findUnique = jest
        .fn()
        .mockResolvedValueOnce({ id: "other" })
        .mockResolvedValueOnce(null);
      const create = jest.fn().mockResolvedValue({ id: "g1", title: "X", inviteCode: "X" });
      const prisma = { chatRoom: { count: jest.fn().mockResolvedValue(0), findUnique, create } };

      await target(prisma).createGroup("u1", "X");

      expect(findUnique).toHaveBeenCalledTimes(2);
      expect(create).toHaveBeenCalled();
    });

    it("stops one account from minting groups without end", async () => {
      const prisma = { chatRoom: { count: jest.fn().mockResolvedValue(20), create: jest.fn() } };

      await expect(target(prisma).createGroup("u1", "Ещё одна")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("gives every member the invite link, not only the owner", async () => {
      // A group somebody made for their own people: a link only the founder may send would make
      // them the bottleneck on their own friends joining.
      const prisma = {
        chatMember: { findUnique: jest.fn().mockResolvedValue({ roomId: "g1", userId: "u2" }) },
        chatRoom: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(
            roomWith({
              members: [
                {
                  joinedAt: at(0),
                  user: { id: "u1", fullName: "Aman", username: "aman", avatarPath: null },
                },
                {
                  joinedAt: at(1),
                  user: { id: "u2", fullName: null, username: "merjen", avatarPath: null },
                },
              ],
            }),
          ),
        },
      };

      const info = await target(prisma).groupInfo("g1", "u2");

      expect(info.inviteCode).toBe("ABCDEFGHJK");
      expect(info.isOwner).toBe(false);
      expect(info.members.map((m) => [m.name, m.isOwner])).toEqual([
        ["Aman", true],
        ["merjen", false],
      ]);
    });

    it("refuses group details to somebody who is not in it", async () => {
      const prisma = { chatMember: { findUnique: jest.fn().mockResolvedValue(null) } };
      await expect(target(prisma).groupInfo("g1", "stranger")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("shows a name and a size before joining, and nothing about who is in it", async () => {
      // Anybody holding a forwarded link can call this. A preview listing members would turn a
      // leaked link into a way to read a private conversation's membership.
      const prisma = {
        chatRoom: {
          findUnique: jest.fn().mockResolvedValue({ id: "g1", title: "Друзья", kind: "GROUP" }),
        },
        chatMember: {
          findUnique: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(4),
        },
      };

      const preview = await target(prisma).invitePreview("abcdefghjk", "u9");

      expect(preview).toEqual({
        id: "g1",
        title: "Друзья",
        memberCount: 4,
        alreadyMember: false,
        conversationId: "room:g1",
      });
      expect(Object.keys(preview)).not.toContain("members");
    });

    it("reads a code however it was typed", async () => {
      const findUnique = jest.fn().mockResolvedValue({ id: "g1", title: "X", kind: "GROUP" });
      const prisma = {
        chatRoom: { findUnique },
        chatMember: {
          findUnique: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(1),
        },
      };

      await target(prisma).invitePreview("  abcdefghjk  ", "u9");

      expect(findUnique.mock.calls[0][0].where.inviteCode).toBe("ABCDEFGHJK");
    });

    it("answers a retired code exactly as it answers one that never existed", async () => {
      const prisma = { chatRoom: { findUnique: jest.fn().mockResolvedValue(null) } };
      await expect(target(prisma).joinByInvite("GONECODE12", "u9")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("will not let a link into a channel", async () => {
      // Channels are joined from the channel list. A code that reached one would be a second,
      // unaudited door into a room with different rules.
      const prisma = {
        chatRoom: {
          findUnique: jest.fn().mockResolvedValue({ id: "c1", title: "X", kind: "CHANNEL" }),
        },
      };
      await expect(target(prisma).joinByInvite("ABCDEFGHJK", "u9")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("joins once, and a second tap is not an error", async () => {
      const createMany = jest.fn().mockResolvedValue({ count: 0 });
      const prisma = {
        chatRoom: {
          findUnique: jest.fn().mockResolvedValue({ id: "g1", title: "Друзья", kind: "GROUP" }),
        },
        chatMember: {
          findUnique: jest.fn().mockResolvedValue({ roomId: "g1", userId: "u9" }),
          count: jest.fn(),
          createMany,
        },
      };

      const joined = await target(prisma).joinByInvite("ABCDEFGHJK", "u9");

      expect(joined.conversationId).toBe("room:g1");
      expect(createMany).not.toHaveBeenCalled();
    });

    it("refuses to join a group that is already full", async () => {
      const prisma = {
        chatRoom: {
          findUnique: jest.fn().mockResolvedValue({ id: "g1", title: "X", kind: "GROUP" }),
        },
        chatMember: {
          findUnique: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(100),
          createMany: jest.fn(),
        },
      };

      await expect(target(prisma).joinByInvite("ABCDEFGHJK", "u9")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("lets a member leave", async () => {
      const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      const prisma = {
        chatMember: {
          findUnique: jest.fn().mockResolvedValue({ roomId: "g1", userId: "u2" }),
          deleteMany,
        },
        chatRoom: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ kind: "GROUP", createdById: "u1" }),
        },
      };

      await expect(target(prisma).leaveGroup("g1", "u2")).resolves.toEqual({ left: true });
      expect(deleteMany).toHaveBeenCalledWith({ where: { roomId: "g1", userId: "u2" } });
    });

    it("keeps the owner in, because walking out would strand everybody else", async () => {
      const prisma = {
        chatMember: {
          findUnique: jest.fn().mockResolvedValue({ roomId: "g1", userId: "u1" }),
          deleteMany: jest.fn(),
        },
        chatRoom: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ kind: "GROUP", createdById: "u1" }),
        },
      };

      await expect(target(prisma).leaveGroup("g1", "u1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("lets only the owner reset the link or close the group", async () => {
      const prisma = {
        chatRoom: {
          findUnique: jest.fn().mockResolvedValue({ id: "g1", kind: "GROUP", createdById: "u1" }),
          update: jest.fn(),
          delete: jest.fn(),
        },
      };

      await expect(target(prisma).rotateInvite("g1", "u2")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(target(prisma).deleteGroup("g1", "u2")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.chatRoom.update).not.toHaveBeenCalled();
      expect(prisma.chatRoom.delete).not.toHaveBeenCalled();
    });

    it("replaces the code on a reset, so a leaked link stops working", async () => {
      const update = jest.fn().mockResolvedValue({});
      const prisma = {
        chatRoom: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({ id: "g1", kind: "GROUP", createdById: "u1" })
            .mockResolvedValue(null),
          update,
        },
      };

      const rotated = await target(prisma).rotateInvite("g1", "u1");

      expect(rotated.inviteCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);
      expect(update.mock.calls[0][0].data.inviteCode).toBe(rotated.inviteCode);
    });
  });

  describe("createRoom", () => {
    it("always includes its creator, and never twice", async () => {
      const create = jest.fn().mockResolvedValue({});
      const prisma = { user: { count: jest.fn().mockResolvedValue(2) }, chatRoom: { create } };

      await target(prisma).createRoom("Оптовики", ["u2", "u2"], "admin1");

      const members = create.mock.calls[0][0].data.members.create;
      expect(members.map((m: { userId: string }) => m.userId).sort()).toEqual(["admin1", "u2"]);
    });

    it("refuses a member id that is not a real user", async () => {
      const prisma = { user: { count: jest.fn().mockResolvedValue(1) }, chatRoom: { create: jest.fn() } };

      await expect(
        target(prisma).createRoom("Оптовики", ["ghost"], "admin1"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a blank title", async () => {
      const prisma = { user: { count: jest.fn() }, chatRoom: { create: jest.fn() } };
      await expect(target(prisma).createRoom("   ", ["u2"], "admin1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
