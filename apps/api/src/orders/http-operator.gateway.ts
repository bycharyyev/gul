import { Injectable } from "@nestjs/common";
import type { Order } from "@prisma/client";
import type { OperatorGateway, OperatorTopupResult } from "./operator-gateway.interface";

const MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * Production adapter for a reseller/operator bridge implementing Gulyaly's narrow HTTPS contract.
 * The bridge owns vendor-specific product mapping; this API never sends retries after an unknown
 * outcome and always supplies the stable order id as an idempotency key.
 */
@Injectable()
export class HttpOperatorGateway implements OperatorGateway {
  private readonly endpoint: URL;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor() {
    const baseUrl = process.env.TOPUP_HTTP_BASE_URL?.trim();
    this.apiKey = process.env.TOPUP_HTTP_API_KEY?.trim() ?? "";
    if (!baseUrl || !this.apiKey) throw new Error("TOPUP_HTTP_BASE_URL and TOPUP_HTTP_API_KEY are required");
    const base = new URL(baseUrl);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    ) {
      throw new Error("TOPUP_HTTP_BASE_URL must be a clean HTTPS origin/path");
    }
    this.endpoint = new URL("topups", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    const parsedTimeout = Number(process.env.TOPUP_HTTP_TIMEOUT_MS ?? "10000");
    if (!Number.isInteger(parsedTimeout) || parsedTimeout < 1000 || parsedTimeout > 30000) {
      throw new Error("TOPUP_HTTP_TIMEOUT_MS must be an integer between 1000 and 30000");
    }
    this.timeoutMs = parsedTimeout;
  }

  async topUp(order: Order, idempotencyKey: string): Promise<OperatorTopupResult> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        idempotencyKey,
        orderId: order.id,
        serviceId: order.serviceId,
        recipientIdentifier: order.recipientIdentifier,
        amount: { value: order.amountTmt.toString(), currency: "TMT" },
      }),
    });
    const text = await this.readLimitedBody(response);
    if (!response.ok) throw new Error(`Operator HTTP ${response.status}`);

    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("Operator returned invalid JSON");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Operator returned invalid response");
    }
    const body = value as Record<string, unknown>;
    if (!["CONFIRMED", "DECLINED", "UNKNOWN"].includes(String(body.outcome))) {
      throw new Error("Operator returned invalid outcome");
    }
    const operatorRef = typeof body.operatorRef === "string" ? body.operatorRef.trim() : undefined;
    const errorMessage = typeof body.errorMessage === "string" ? body.errorMessage.trim() : undefined;
    if (operatorRef && (operatorRef.length > 200 || /[\u0000-\u001f]/.test(operatorRef))) {
      throw new Error("Operator returned invalid reference");
    }
    if (body.outcome === "CONFIRMED" && !operatorRef) throw new Error("Confirmed operator result requires a reference");
    if (errorMessage && errorMessage.length > 500) throw new Error("Operator returned invalid error");
    return { outcome: body.outcome as OperatorTopupResult["outcome"], operatorRef, errorMessage };
  }

  private async readLimitedBody(response: Response): Promise<string> {
    const declared = Number(response.headers?.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("Operator response is too large");
    if (!response.body) {
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error("Operator response is too large");
      return text;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error("Operator response is too large");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  }
}
