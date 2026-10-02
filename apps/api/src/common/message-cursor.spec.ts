import { ChatService } from "../chat/chat.service";
import { SupportService } from "../support/support.service";
import { afterCursor, parseAfter } from "./message-cursor";

const AT = new Date("2026-10-02T10:00:00.000Z");
const CURSOR_ID = "cmgaaaaaaaaaaaaaaaaaaaaa1";

describe("parseAfter / afterCursor", () => {
  it("accepts only cuid-like ids", () => {
    expect(parseAfter(CURSOR_ID)).toBe(CURSOR_ID);
    expect(parseAfter("x' OR 1=1")).toBeUndefined();
    expect(parseAfter("")).toBeUndefined();
    expect(parseAfter(["a"])).toBeUndefined();
  });

  it("is strictly after the cursor, ties broken by id", () => {
    expect(afterCursor({ id: CURSOR_ID, createdAt: AT })).toEqual({
      OR: [{ createdAt: { gt: AT } }, { createdAt: AT, id: { gt: CURSOR_ID } }],
    });
  });
});

describe("ChatService.messages with ?after", () => {
  function setup(member = true) {
    const prisma = {
      chatMember: { findUnique: jest.fn().mockResolvedValue(member ? { roomId: "r1", userId: "u1" } : null) },
      chatRoom: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "r1",
          title: "Group",
          kind: "GROUP",
          imageUrl: null,
          createdById: "u1",
          officialCategory: null,
        }),
      },
      chatMessage: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ id: "m2" }, { id: "m3" }]),
      },
    };
    return { prisma, service: new ChatService(prisma as never, { publicBase: "https://x" } as never) };
  }

  it("returns only newer messages, oldest first, when the cursor is in this room", async () => {
    const { prisma, service } = setup();
    prisma.chatMessage.findFirst.mockResolvedValue({ id: CURSOR_ID, createdAt: AT });

    const res = await service.messages("r1", "u1", CURSOR_ID);

    expect(prisma.chatMessage.findFirst).toHaveBeenCalledWith({
      where: { id: CURSOR_ID, roomId: "r1" },
      select: { id: true, createdAt: true },
    });
    expect(prisma.chatMessage.findMany.mock.calls[0][0]).toMatchObject({
      where: { roomId: "r1", ...afterCursor({ id: CURSOR_ID, createdAt: AT }) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(res.incremental).toBe(true);
    expect(res.messages.map((m) => m.id)).toEqual(["m2", "m3"]); // not reversed
  });

  it("a cursor from another room gives the ordinary full read, nothing about that room", async () => {
    const { prisma, service } = setup();
    prisma.chatMessage.findFirst.mockResolvedValue(null); // not in r1

    const res = await service.messages("r1", "u1", CURSOR_ID);

    expect(prisma.chatMessage.findMany.mock.calls[0][0]).toMatchObject({ where: { roomId: "r1" }, take: 200 });
    expect(res.incremental).toBe(false);
    expect(res.messages.map((m) => m.id)).toEqual(["m3", "m2"]); // full read is reversed newest-first
  });

  it("a non-member is refused before any cursor is looked at", async () => {
    const { prisma, service } = setup(false);
    await expect(service.messages("r1", "intruder", CURSOR_ID)).rejects.toThrow("CHAT_ROOM_NOT_FOUND");
    expect(prisma.chatMessage.findFirst).not.toHaveBeenCalled();
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
  });
});

describe("SupportService thread reads with ?after", () => {
  function setup(newMessages: Array<{ id: string; senderRole: string }>) {
    const prisma = {
      supportThread: {
        findFirst: jest.fn().mockResolvedValue({ id: "t1", userId: "u1", sellerId: null, status: "OPEN" }),
      },
      supportMessage: {
        findFirst: jest.fn().mockResolvedValue({ id: CURSOR_ID, createdAt: AT }),
        findMany: jest.fn().mockResolvedValue(newMessages),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    return { prisma, service: new SupportService(prisma as never, { publicBase: "https://x" } as never) };
  }

  it("a customer poll that brought nothing new marks nothing read (no write every 4 s)", async () => {
    const { prisma, service } = setup([]);
    const res = await service.getMyThread("u1", null, CURSOR_ID);
    expect(res.incremental).toBe(true);
    expect(prisma.supportMessage.updateMany).not.toHaveBeenCalled();
  });

  it("a staff reply arriving in the poll is marked read for the customer", async () => {
    const { prisma, service } = setup([{ id: "m9", senderRole: "STAFF" }]);
    await service.getMyThread("u1", null, CURSOR_ID);
    expect(prisma.supportMessage.updateMany).toHaveBeenCalled();
  });

  it("staff polls only mark customer messages, and only when one arrived", async () => {
    const own = setup([{ id: "m9", senderRole: "STAFF" }]);
    await own.service.getThreadForStaff("t1", CURSOR_ID);
    expect(own.prisma.supportMessage.updateMany).not.toHaveBeenCalled();

    const fromCustomer = setup([{ id: "m9", senderRole: "CUSTOMER" }]);
    const res = await fromCustomer.service.getThreadForStaff("t1", CURSOR_ID);
    expect(fromCustomer.prisma.supportMessage.updateMany).toHaveBeenCalled();
    expect(res.incremental).toBe(true);
  });

  it("the cursor is resolved inside the thread being read", async () => {
    const { prisma, service } = setup([]);
    await service.getThreadForStaff("t1", CURSOR_ID);
    expect(prisma.supportMessage.findFirst).toHaveBeenCalledWith({
      where: { id: CURSOR_ID, threadId: "t1" },
      select: { id: true, createdAt: true },
    });
  });
});
