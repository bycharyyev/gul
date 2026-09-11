import { promises as fs } from "node:fs";
import * as path from "node:path";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { ReferralsService } from "../referrals/referrals.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import type { CreateStaffUserDto } from "./dto/create-staff-user.dto";
import type { UpdateUserDto } from "./dto/update-user.dto";

function uploadsDir(): string {
  return path.resolve(process.env.UPLOADS_DIR ?? "./uploads");
}

const SAFE_SELECT = {
  id: true,
  phone: true,
  fullName: true,
  // The referral code. Public by nature -- it is what this account's own invitation links say --
  // and staff need to see it to answer "which code do I have?" and to hand a partner a better one.
  username: true,
  role: true,
  isBlocked: true,
  createdAt: true,
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private referrals: ReferralsService,
    private auditLog: AuditLogService,
  ) {}

  listStaff() {
    return this.prisma.user.findMany({
      where: { role: { in: ["SUPPORT", "MANAGER", "ADMIN"] } },
      select: SAFE_SELECT,
      orderBy: { createdAt: "asc" },
    });
  }

  listCustomers(search?: string) {
    return this.prisma.user.findMany({
      where: {
        role: "CUSTOMER",
        ...(search
          ? {
              OR: [
                { phone: { contains: search, mode: "insensitive" as const } },
                { fullName: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: { ...SAFE_SELECT, _count: { select: { orders: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async getCustomerStats() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [total, blocked, newLast7Days, newLast30Days] = await Promise.all([
      this.prisma.user.count({ where: { role: "CUSTOMER" } }),
      this.prisma.user.count({ where: { role: "CUSTOMER", isBlocked: true } }),
      this.prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    return { total, blocked, newLast7Days, newLast30Days };
  }

  async getCustomerDetail(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, role: "CUSTOMER" }, select: SAFE_SELECT });
    if (!user) throw new NotFoundException("Customer not found");

    const orders = await this.prisma.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      include: { service: { select: { name: true } } },
    });

    return { user, orders };
  }

  async createStaff(dto: CreateStaffUserDto, adminId: string) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) throw new ConflictException("PHONE_ALREADY_REGISTERED");

    const passwordHash = await argon2.hash(dto.password);
    const username = await this.referrals.generateUsername();
    const created = await this.prisma.user.create({
      data: { phone: dto.phone, passwordHash, fullName: dto.fullName, role: dto.role, username },
      select: SAFE_SELECT,
    });
    this.auditLog.record(adminId, "user.create_staff", "User", created.id, { role: dto.role });
    return created;
  }

  async updateUser(id: string, dto: UpdateUserDto, requesterId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    if (id === requesterId && (dto.role || dto.isBlocked)) {
      throw new BadRequestException("Cannot change your own role or blocked status");
    }

    // One ADMIN must not be able to demote/block another ADMIN -- otherwise any single
    // compromised or rogue admin account can silently disable every other admin.
    if (user.role === "ADMIN" && (dto.role || dto.isBlocked)) {
      throw new BadRequestException("Cannot change another admin's role or blocked status");
    }

    const updated = await this.prisma.user.update({ where: { id }, data: dto, select: SAFE_SELECT });
    if (dto.role || dto.isBlocked !== undefined) {
      this.auditLog.record(requesterId, "user.privilege_change", "User", id, {
        role: dto.role,
        isBlocked: dto.isBlocked,
      });
    }
    return updated;
  }

  async deleteUser(id: string, requesterId: string) {
    if (id === requesterId) throw new BadRequestException("Cannot delete your own account");
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("User not found");

    // Document rows cascade-delete via the FK (onDelete: Cascade), but that only removes
    // the DB rows — the files on disk don't go with them, so grab the keys first and
    // clean them up after the delete succeeds.
    const documents = await this.prisma.document.findMany({ where: { userId: id }, select: { storedName: true } });

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch {
      throw new ConflictException(
        "Cannot delete: this user has related records (orders, API keys, audit logs). Block them instead.",
      );
    }

    await Promise.all(
      documents.map((doc) => fs.unlink(path.join(uploadsDir(), doc.storedName)).catch(() => {})),
    );
  }
}
