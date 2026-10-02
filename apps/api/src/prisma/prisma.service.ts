import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * DATABASE_URL with `connection_limit` taken from PRISMA_CONNECTION_LIMIT, unless the URL already
 * sets one. Without it Prisma opens cores*2+1 (13 on these boxes) per process, and with several API
 * processes per node (ADR 0008) that approaches PostgreSQL's max_connections of 100. The limit is
 * set per process in the compose file rather than in .env, so one secret URL serves every role.
 */
export function withConnectionLimit(url: string | undefined, limit: string | undefined): string | undefined {
  const n = Number(limit);
  if (!url || !Number.isInteger(n) || n < 1 || /[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=${n}`;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = withConnectionLimit(process.env.DATABASE_URL, process.env.PRISMA_CONNECTION_LIMIT);
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
