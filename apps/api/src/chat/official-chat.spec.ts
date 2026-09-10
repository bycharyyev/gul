import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ChatService } from "./chat.service";

function setup(role = "MANAGER") {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ role }) },
    chatRoom: {
      upsert: jest.fn().mockResolvedValue({ id: "official" }),
      findUnique: jest.fn().mockResolvedValue({ id: "official", kind: "CHANNEL", officialCategory: "NEWS" }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "official", kind: "CHANNEL", officialCategory: "NEWS", createdById: "staff" }),
      update: jest.fn().mockResolvedValue({}),
    },
    chatMember: { findUnique: jest.fn().mockResolvedValue({ userId: "staff" }) },
    chatMessage: { create: jest.fn().mockResolvedValue({ id: "message" }), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  return { prisma, service: new ChatService(prisma as never) };
}

describe("Official chat channels", () => {
  it.each(["CUSTOMER", "SELLER", "SUPPORT"])("rejects publishing/setup for %s", async (role) => {
    const { prisma, service } = setup(role);
    await expect(service.createOfficialChannel("user", "NEWS")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.publishOfficial("official", "user", "hello")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.chatRoom.upsert).not.toHaveBeenCalled();
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it("uses a unique category to make repeated setup idempotent", async () => {
    const { prisma, service } = setup();
    await service.createOfficialChannel("staff", "SECURITY");
    expect(prisma.chatRoom.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { officialCategory: "SECURITY" }, update: {},
      create: expect.objectContaining({ kind: "CHANNEL", officialCategory: "SECURITY", createdById: "staff" }),
    }));
  });

  it("keeps official subscription voluntary and prevents deleting the service channel", async () => {
    const { service } = setup();
    await expect(service.addMembers("official", ["reader"])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.removeMember("official", "reader")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.adminDeleteRoom("official")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not let staff broadcast into a private group through the official endpoint", async () => {
    const { prisma, service } = setup();
    prisma.chatRoom.findUnique.mockResolvedValue({ id: "private", kind: "GROUP", officialCategory: null } as never);
    await expect(service.publishOfficial("private", "staff", "hello")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it("requires the staff endpoint even when the subscriber originally created the official channel", async () => {
    const { prisma, service } = setup();
    await expect(service.send("official", "staff", "hello")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    const view = await service.messages("official", "staff");
    expect(view.room.canPost).toBe(false);
    expect(view.room.officialCategory).toBe("NEWS");
  });

  it("rejects empty announcements and writes a valid announcement atomically with inbox ordering", async () => {
    const { prisma, service } = setup();
    await expect(service.publishOfficial("official", "staff", "  ")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    await service.publishOfficial("official", "staff", "  Обновление  ");
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({ data: { roomId: "official", authorId: "staff", body: "Обновление" } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("loads the newest bounded window but presents messages chronologically", async () => {
    const { prisma, service } = setup();
    prisma.chatMessage.findMany.mockResolvedValue([{ id: "new" }, { id: "old" }] as never);
    const view = await service.messages("official", "reader");
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200,
    }));
    expect(view.messages.map((message) => message.id)).toEqual(["old", "new"]);
  });
});
