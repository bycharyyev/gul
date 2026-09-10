import { Injectable, Logger } from "@nestjs/common";
import type { EmailKind, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "./email.service";

/** How many rows one dispatch pass claims. Small: a pass runs every few seconds. */
const BATCH_SIZE = 20;
/** Give up after this many failed dispatches and leave the row for a human to look at. */
const MAX_ATTEMPTS = 5;

type OutboxRow = {
  id: string;
  kind: EmailKind;
  orderId: string | null;
  idempotencyKey: string;
  attempts: number;
};

/**
 * Transactional outbox for order mail.
 *
 * `record` must be called with the same transaction client as the business change, so the row
 * and the change commit together. `dispatchPending` then turns rows into actual sends.
 */
@Injectable()
export class EmailOutboxService {
  private readonly logger = new Logger(EmailOutboxService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  /**
   * Records that an email is owed. Takes a transaction client rather than using `this.prisma`,
   * because the entire point is to commit atomically with the caller's own write.
   *
   * Duplicate keys are ignored: re-running the same business event records the obligation once.
   */
  async record(
    tx: Prisma.TransactionClient,
    params: { kind: EmailKind; orderId?: string; idempotencyKey: string },
  ) {
    await tx.emailOutbox.createMany({
      data: [{ kind: params.kind, orderId: params.orderId, idempotencyKey: params.idempotencyKey }],
      skipDuplicates: true,
    });
  }

  /**
   * Claims a batch and sends it.
   *
   * The claim is a single `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`. Both
   * hosts run this loop against the same database, and `SKIP LOCKED` is what stops them from
   * claiming the same row: each takes a disjoint batch instead of blocking on each other.
   */
  async dispatchPending(): Promise<number> {
    const claimed = await this.prisma.$queryRaw<OutboxRow[]>`
      UPDATE "EmailOutbox" SET status = 'DISPATCHING', attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM "EmailOutbox"
        WHERE status = 'PENDING'
        ORDER BY "createdAt"
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, kind, "orderId", "idempotencyKey", attempts
    `;

    for (const row of claimed) {
      try {
        await this.send(row);
        await this.prisma.emailOutbox.update({
          where: { id: row.id },
          data: { status: "DISPATCHED", dispatchedAt: new Date(), lastError: null },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Back to PENDING for another pass, unless it has already burned its attempts -- at
        // which point leave it FAILED and visible rather than retrying forever.
        const exhausted = row.attempts >= MAX_ATTEMPTS;
        await this.prisma.emailOutbox.update({
          where: { id: row.id },
          data: { status: exhausted ? "FAILED" : "PENDING", lastError: message },
        });
        this.logger[exhausted ? "error" : "warn"](
          `Outbox ${row.id} (${row.kind}) dispatch failed on attempt ${row.attempts}: ${message}`,
        );
      }
    }

    return claimed.length;
  }

  /**
   * Turns a row into a send by calling the same EmailService method the business code used to
   * call directly. Nothing about recipient, locale or template resolution is duplicated here,
   * and it reflects the order's state at dispatch time rather than a stale snapshot.
   */
  private async send(row: OutboxRow) {
    if (!row.orderId) throw new Error(`Outbox row ${row.id} of kind ${row.kind} has no orderId`);
    if (row.kind === "ORDER_CREATED") {
      await this.email.sendOrderCreated(row.orderId);
      return;
    }
    if (row.kind === "ORDER_COMPLETED" || row.kind === "ORDER_FAILED") {
      await this.email.sendOrderStatusUpdate(row.orderId);
      return;
    }
    throw new Error(`No outbox dispatcher for kind ${row.kind}`);
  }

  /** Rows a human should look at, for the admin dashboard. */
  listFailed(limit = 100) {
    return this.prisma.emailOutbox.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /** Puts a failed row back in the queue after the underlying problem has been fixed. */
  async retry(id: string) {
    return this.prisma.emailOutbox.update({
      where: { id },
      data: { status: "PENDING", attempts: 0, lastError: null },
    });
  }
}
