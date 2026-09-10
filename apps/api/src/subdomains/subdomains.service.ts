import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import type { CreateSubdomainDto } from "./dto/create-subdomain.dto";

const WORKFLOW_FILE = "provision-subdomain.yml";

@Injectable()
export class SubdomainsService {
  private readonly logger = new Logger(SubdomainsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private auditLog: AuditLogService,
  ) {}

  listAll() {
    return this.prisma.managedSubdomain.findMany({ orderBy: { createdAt: "desc" } });
  }

  async create(dto: CreateSubdomainDto, adminId: string) {
    const existing = await this.prisma.managedSubdomain.findUnique({ where: { name: dto.name } });
    if (existing && existing.status !== "REMOVED") {
      throw new ConflictException("This subdomain is already managed");
    }

    const row = existing
      ? await this.prisma.managedSubdomain.update({
          where: { id: existing.id },
          data: { targetPort: dto.targetPort, status: "PENDING", lastError: null },
        })
      : await this.prisma.managedSubdomain.create({
          data: { name: dto.name, targetPort: dto.targetPort, status: "PENDING" },
        });

    try {
      await this.dispatchWorkflow("add", dto.name, dto.targetPort);
    } catch (err) {
      await this.prisma.managedSubdomain.update({
        where: { id: row.id },
        data: { status: "FAILED", lastError: (err as Error).message },
      });
      throw err;
    }

    this.auditLog.record(adminId, "subdomain.create", "ManagedSubdomain", row.id, dto);
    return row;
  }

  async remove(id: string, adminId: string) {
    const row = await this.prisma.managedSubdomain.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Subdomain not found");

    await this.prisma.managedSubdomain.update({ where: { id }, data: { status: "PENDING" } });
    try {
      await this.dispatchWorkflow("remove", row.name);
    } catch (err) {
      await this.prisma.managedSubdomain.update({
        where: { id },
        data: { status: "FAILED", lastError: (err as Error).message },
      });
      throw err;
    }
    this.auditLog.record(adminId, "subdomain.remove", "ManagedSubdomain", id, { name: row.name });
  }

  /** Called by the GitHub Actions workflow itself once it finishes -- see the "Report status
   *  back" step in provision-subdomain.yml. Not exposed to the admin UI. */
  async reportStatus(name: string, status: "ACTIVE" | "FAILED" | "REMOVED", lastError?: string) {
    await this.prisma.managedSubdomain.updateMany({
      where: { name },
      data: { status, lastError: lastError ?? null },
    });
  }

  private async dispatchWorkflow(action: "add" | "remove", name: string, port?: number) {
    const token = this.config.get<string>("GH_ACTIONS_TOKEN");
    const repo = this.config.get<string>("GH_REPO");
    if (!token || !repo) {
      throw new BadRequestException(
        "Subdomain provisioning is not configured (GH_ACTIONS_TOKEN / GH_REPO missing) -- set them in .env",
      );
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { action, name, port: port ? String(port) : "" },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      this.logger.error(`GitHub workflow dispatch failed (${res.status}): ${body}`);
      throw new BadRequestException("Failed to trigger provisioning workflow");
    }
  }
}
