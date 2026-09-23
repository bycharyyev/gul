import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { MarketplacePurchaseStatus, Prisma, type MarketplaceSourceCode } from "@prisma/client";
import { AuditLogService } from "../audit-log/audit-log.service";
import { canTransition } from "../common/state-machine";
import { PrismaService } from "../prisma/prisma.service";
import { ADMIN_PURCHASE_TRANSITIONS, MARKETPLACE_HOSTS } from "./marketplace-purchase.constants";
import { ManualReviewMarketplaceAdapter } from "./marketplace-source.adapter";
import { readMarketplaceLink } from "./marketplace-url";
import { expandShortLink, matchShortener } from "./marketplace-shortlink";
import { MarketplaceEnricher } from "./marketplace-enricher";
import type { AcceptMarketplaceQuoteDto, ActualMarketplaceWeightDto, CreateMarketplacePurchaseDto, ReviewMarketplacePurchaseDto, UpdateMarketplacePurchaseSettingsDto } from "./dto/marketplace-purchase.dto";

const INCLUDE = { items: true, quotes: { orderBy: { version: "asc" as const } } } as const;

/** A convenience list, not an archive -- see MarketplaceSearchHistory's schema comment. */
const MARKETPLACE_HISTORY_LIMIT = 5;

@Injectable()
export class MarketplacePurchaseService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
    private manualAdapter: ManualReviewMarketplaceAdapter,
  ) {}

  // A plain field rather than a constructor parameter: Nest resolves every constructor parameter
  // of a provider, and this one is not in the container. Assignable so a test can stub it.
  private enricher = new MarketplaceEnricher();

  private canonicalUrl(source: MarketplaceSourceCode, raw: string): string {
    let url: URL;
    try { url = new URL(raw); } catch { throw new BadRequestException("Invalid marketplace URL"); }
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new BadRequestException("Marketplace URL must be public HTTPS");
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!(MARKETPLACE_HOSTS[source] as readonly string[]).includes(host)) throw new BadRequestException("URL host does not match marketplace source");
    // Fragments are client-only, tracking parameters are not part of product identity.
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|yclid|gclid|from|ref|spm|sk|scm)/i.test(key)) url.searchParams.delete(key);
    url.hostname = host;
    return url.toString();
  }

  async sources() { return this.prisma.marketplacePurchaseSource.findMany({ where: { isEnabled: true }, orderBy: { name: "asc" } }); }
  async sourcesAdmin() { return this.prisma.marketplacePurchaseSource.findMany({ orderBy: { name: "asc" } }); }
  async settings() { return this.prisma.marketplacePurchaseSettings.findUniqueOrThrow({ where: { id: "singleton" } }); }
  async updateSource(code: string, dto: { isEnabled: boolean; requiresManualReview: boolean }, adminId: string) {
    if (!(code in MARKETPLACE_HOSTS)) throw new BadRequestException("Unsupported marketplace source");
    // Hosts and adapter keys are deliberately not admin-editable: they are executable trust policy.
    const result = await this.prisma.marketplacePurchaseSource.update({ where: { code: code as MarketplaceSourceCode }, data: dto });
    this.audit.record(adminId, "marketplace-purchase.source", "MarketplacePurchaseSource", code, dto);
    return result;
  }

  async create(userId: string, dto: CreateMarketplacePurchaseDto) {
    const prior = await this.prisma.marketplacePurchaseOrder.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: INCLUDE });
    if (prior) {
      if (prior.userId !== userId) throw new ConflictException("Idempotency key belongs to another user");
      return prior;
    }
    const enabled = await this.prisma.marketplacePurchaseSource.findMany({ where: { code: { in: dto.items.map(i => i.sourceCode) }, isEnabled: true }, select: { code: true } });
    const allowed = new Set(enabled.map(row => row.code));
    if (dto.items.some(item => !allowed.has(item.sourceCode))) throw new BadRequestException("Marketplace source is disabled");
    const items = await Promise.all(dto.items.map(async item => {
      const canonicalUrl = this.canonicalUrl(item.sourceCode, item.url);
      // Registry currently resolves every source to the safe manual adapter. Future official API
      // adapters plug in here, but are still given a validated URL and must use fixed API origins.
      const snapshot = await this.manualAdapter.resolve(canonicalUrl, item.variant);
      return { ...item, canonicalUrl, snapshot };
    }));
    try {
      return await this.prisma.marketplacePurchaseOrder.create({
        data: {
          userId, currency: dto.currency, deliveryAddress: dto.deliveryAddress, idempotencyKey: dto.idempotencyKey,
          status: "MANUAL_REVIEW",
          items: { create: items.map(({ url: _url, snapshot, ...item }) => ({ ...item, titleSnapshot: snapshot?.title, externalIdSnapshot: snapshot?.externalId, imageUrlSnapshot: snapshot?.imageUrl, unitPriceSnapshot: snapshot?.unitPrice, sourceCurrencySnapshot: snapshot?.currency, estimatedWeightKg: snapshot?.estimatedWeightKg ?? item.estimatedWeightKg, snapshotPayload: snapshot?.payload })) },
        }, include: INCLUDE,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      const winner = await this.prisma.marketplacePurchaseOrder.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: INCLUDE });
      if (!winner || winner.userId !== userId) throw new ConflictException("Idempotency key collision");
      return winner;
    }
  }

  /**
   * Paste a link, see immediately what it is. Runs no network call: the marketplace comes from
   * the host and the article number from the URL's own shape, so the answer is instant and cannot
   * be wrong about a price it never claimed to know.
   *
   * `requiresManualReview` is returned rather than implied. The card a customer sees says "we
   * recognised this product, a person will confirm the price" -- which is true -- instead of
   * showing a fabricated amount.
   */
  async resolveLink(userId: string, rawUrl: string) {
    const sources = await this.prisma.marketplacePurchaseSource.findMany({ where: { isEnabled: true } });

    // What people actually paste is the share button's output -- ozon.ru/t/... or
    // market.yandex.ru/cc/... -- which carries no article number at all. Expand it first, by
    // reading one Location header from the vendor's own shortener. See marketplace-shortlink.ts
    // for why this stops at the first hop and never touches a product page.
    let effectiveUrl = rawUrl;
    const shortenerSource = matchShortener(rawUrl);
    if (shortenerSource) {
      const owner = sources.find((row) => row.code === shortenerSource);
      if (!owner) throw new BadRequestException("This marketplace is not supported yet");
      const expanded = await expandShortLink(rawUrl, owner.allowedHosts);
      if (!expanded) {
        // Say what to do instead. A short link that will not expand is usually expired or
        // region-blocked, and the customer has the full URL one tap away in the shop.
        throw new BadRequestException("SHORT_LINK_NOT_RESOLVED");
      }
      effectiveUrl = expanded;
    }

    let host: string;
    try {
      host = new URL(effectiveUrl).hostname.toLowerCase().replace(/\.$/, "");
    } catch {
      throw new BadRequestException("Invalid marketplace URL");
    }
    // Which marketplace this is, is ours to decide from the host -- never the client's to declare.
    const source = sources.find((row) => row.allowedHosts.includes(host));
    if (!source) throw new BadRequestException("This marketplace is not supported yet");

    const canonicalUrl = this.canonicalUrl(source.code, effectiveUrl);
    const identity = readMarketplaceLink(source.code, canonicalUrl);

    // Only real product pages are remembered. A category or search page in the history list would
    // be a link the customer cannot actually order from.
    if (identity.isProductPage) await this.rememberSearch(userId, source.code, canonicalUrl, identity.externalId);

    // Best-effort, and only where it can actually succeed: Wildberries answers a public card API,
    // Ozon and Yandex answer 307 to everything without a stealth browser. A failure here is not an
    // error -- the card still shows the marketplace and the article, which is what the URL gave us.
    const facts = identity.isProductPage
      ? await this.enricher.enrich(source.code, identity.externalId)
      : { title: null, seller: null, priceCurrent: null, priceOriginal: null, currency: null };

    return {
      sourceCode: source.code,
      sourceName: source.name,
      canonicalUrl,
      externalId: identity.externalId,
      isProductPage: identity.isProductPage,
      requiresManualReview: source.requiresManualReview,
      title: facts.title,
      seller: facts.seller,
      priceCurrent: facts.priceCurrent,
      priceOriginal: facts.priceOriginal,
      priceCurrency: facts.currency,
    };
  }

  /** Upsert-then-prune: the same product pasted twice moves to the top instead of duplicating. */
  private async rememberSearch(
    userId: string,
    sourceCode: MarketplaceSourceCode,
    canonicalUrl: string,
    externalId: string | null,
  ) {
    await this.prisma.$transaction(async (tx) => {
      // The same product shared twice does not produce the same URL. Ozon's expanded share link
      // carries a per-share `sh`/`short` pair, Yandex's an `offerid`/`cpc`/`publicId`/`do-waremd5`
      // set -- none of which the tracking-parameter strip removes, because they are not tracking
      // parameters, just noise that differs on every share. Deduplicating on the URL therefore
      // put the same article in the list twice, which is what a customer saw. Identity is the
      // article number; collapse on it whenever the URL gave us one.
      if (externalId) {
        const twins = await tx.marketplaceSearchHistory.findMany({
          where: { userId, sourceCode, externalId, canonicalUrl: { not: canonicalUrl } },
          select: { id: true },
        });
        if (twins.length > 0) {
          await tx.marketplaceSearchHistory.deleteMany({ where: { id: { in: twins.map((row) => row.id) } } });
        }
      }
      await tx.marketplaceSearchHistory.upsert({
        where: { userId_canonicalUrl: { userId, canonicalUrl } },
        create: { userId, sourceCode, canonicalUrl, externalId },
        update: { createdAt: new Date(), externalId },
      });
      const stale = await tx.marketplaceSearchHistory.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: MARKETPLACE_HISTORY_LIMIT,
        select: { id: true },
      });
      if (stale.length > 0) {
        await tx.marketplaceSearchHistory.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
      }
    });
  }

  history(userId: string) {
    return this.prisma.marketplaceSearchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: MARKETPLACE_HISTORY_LIMIT,
      select: { id: true, sourceCode: true, canonicalUrl: true, externalId: true, createdAt: true },
    });
  }

  async clearHistory(userId: string) {
    await this.prisma.marketplaceSearchHistory.deleteMany({ where: { userId } });
    return { cleared: true };
  }

  mine(userId: string) { return this.prisma.marketplacePurchaseOrder.findMany({ where: { userId }, include: INCLUDE, orderBy: { createdAt: "desc" } }); }
  async one(id: string, requester: { userId: string; role: string }) {
    const order = await this.prisma.marketplacePurchaseOrder.findUnique({ where: { id }, include: INCLUDE });
    if (!order) throw new NotFoundException("Marketplace purchase not found");
    // Same 404 as a genuinely missing id, never a 403: a 403 confirms the id exists, which is the
    // IDOR-adjacent leak CargoService.findOne already avoids. Keep the two verticals consistent.
    if (order.userId !== requester.userId && !["ADMIN", "MANAGER"].includes(requester.role)) throw new NotFoundException("Marketplace purchase not found");
    return order;
  }

  adminList(status?: MarketplacePurchaseStatus) {
    if (status && !Object.values(MarketplacePurchaseStatus).includes(status)) throw new BadRequestException("Invalid marketplace purchase status");
    return this.prisma.marketplacePurchaseOrder.findMany({ where: status ? { status } : undefined, include: INCLUDE, orderBy: { createdAt: "desc" }, take: 200 });
  }

  async review(id: string, dto: ReviewMarketplacePurchaseDto, adminId: string) {
    const result = await this.prisma.$transaction(async tx => {
      const order = await tx.marketplacePurchaseOrder.findUnique({ where: { id }, include: INCLUDE });
      if (!order) throw new NotFoundException("Marketplace purchase not found");
      if (order.status !== "MANUAL_REVIEW") throw new BadRequestException("Order is not awaiting review");
      if (dto.items.length !== order.items.length || new Set(dto.items.map(i => i.itemId)).size !== order.items.length) throw new BadRequestException("Review must snapshot every cart item exactly once");
      const byId = new Map(dto.items.map(item => [item.itemId, item]));
      let subtotal = 0, weight = 0;
      for (const item of order.items) {
        const reviewed = byId.get(item.id);
        if (!reviewed || !Number.isFinite(reviewed.unitPriceTmt) || reviewed.unitPriceTmt < 0 || !Number.isFinite(reviewed.estimatedWeightKg) || reviewed.estimatedWeightKg <= 0) throw new BadRequestException("Invalid item review");
        subtotal += reviewed.unitPriceTmt * item.quantity;
        weight += reviewed.estimatedWeightKg * item.quantity;
        await tx.marketplacePurchaseItem.update({ where: { id: item.id }, data: { titleSnapshot: reviewed.title, externalIdSnapshot: reviewed.externalId, imageUrlSnapshot: reviewed.imageUrl, unitPriceSnapshot: reviewed.unitPriceTmt, estimatedWeightKg: reviewed.estimatedWeightKg, snapshotAt: new Date() } });
      }
      const settings = await tx.marketplacePurchaseSettings.findUniqueOrThrow({ where: { id: "singleton" } });
      const fee = Math.max(Number(settings.minimumFeeTmt), subtotal * Number(settings.serviceFeePercent) / 100);
      const shipping = weight * Number(settings.shippingPerKgTmt);
      const total = Math.round((subtotal + fee + shipping) * 100) / 100;
      const quote = await tx.marketplacePurchaseQuote.create({ data: { orderId: id, version: 1, productSubtotalTmt: subtotal, serviceFeeTmt: fee, shippingTmt: shipping, totalTmt: total, fxSnapshot: { base: "TMT", rate: "1" }, weightKg: weight, weightConfidence: "ESTIMATED", expiresAt: new Date(Date.now() + settings.quoteTtlMinutes * 60000) } });
      await tx.marketplacePurchaseOrder.update({ where: { id }, data: { status: "QUOTED", reviewReason: dto.reason } });
      return quote;
    });
    this.audit.record(adminId, "marketplace-purchase.review", "MarketplacePurchaseOrder", id, { quoteVersion: result.version });
    return result;
  }

  async accept(id: string, userId: string, dto: AcceptMarketplaceQuoteDto) {
    if (!dto.consentAccepted) throw new BadRequestException("Explicit consent is required");
    return this.prisma.$transaction(async tx => {
      const order = await tx.marketplacePurchaseOrder.findUnique({ where: { id }, include: { quotes: true } });
      if (!order || order.userId !== userId) throw new NotFoundException("Marketplace purchase not found");
      if (order.status !== "QUOTED") throw new BadRequestException("Order is not awaiting quote acceptance");
      const quote = order.quotes.find(q => q.version === dto.quoteVersion);
      if (!quote || quote.expiresAt <= new Date()) throw new BadRequestException("Quote is missing or expired");
      if (new Prisma.Decimal(dto.maxAuthorizedTmt).lessThan(quote.totalTmt)) throw new BadRequestException("Price cap is below quoted total");
      const account = await tx.marketplacePurchaseAccount.upsert({ where: { userId }, create: { userId }, update: {} });
      const balanceUsed = Math.min(Number(account.balanceTmt), dto.maxAuthorizedTmt);
      if (balanceUsed > 0) {
        const debited = await tx.marketplacePurchaseAccount.updateMany({ where: { userId, balanceTmt: { gte: balanceUsed } }, data: { balanceTmt: { decrement: balanceUsed } } });
        if (!debited.count) throw new ConflictException("Account balance changed concurrently");
        await tx.marketplacePurchaseLedger.create({ data: { orderId: id, type: "BALANCE_DEBIT", amountTmt: balanceUsed, idempotencyKey: `marketplace:${id}:balance-debit` } });
      }
      const nextStatus = balanceUsed === dto.maxAuthorizedTmt ? "AUTHORIZED" : "AUTHORIZATION_PENDING";
      const claimed = await tx.marketplacePurchaseOrder.updateMany({ where: { id, userId, status: "QUOTED", acceptedQuoteVersion: null }, data: { status: nextStatus, acceptedQuoteVersion: quote.version, maxAuthorizedTmt: dto.maxAuthorizedTmt, authorizedTmt: balanceUsed, consentAcceptedAt: new Date(), consentVersion: dto.consentVersion } });
      if (claimed.count === 0) throw new ConflictException("Quote was already accepted");
      return tx.marketplacePurchaseOrder.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    });
  }

  async confirmAuthorization(id: string, provider: string, externalReference: string, amountTmt: number, adminId: string) {
    const result = await this.prisma.$transaction(async tx => {
      const order = await tx.marketplacePurchaseOrder.findUnique({ where: { id } });
      if (!order || order.status !== "AUTHORIZATION_PENDING" || !order.maxAuthorizedTmt) throw new BadRequestException("Order is not awaiting authorization confirmation");
      const remaining = new Prisma.Decimal(order.maxAuthorizedTmt).minus(order.authorizedTmt);
      if (!new Prisma.Decimal(amountTmt).equals(remaining)) throw new BadRequestException("Confirmed authorization must equal the unfunded consented maximum");
      const claimed = await tx.marketplacePurchaseOrder.updateMany({ where: { id, status: "AUTHORIZATION_PENDING", fundingReference: null }, data: { status: "AUTHORIZED", authorizedTmt: order.maxAuthorizedTmt, fundingProvider: provider, fundingReference: externalReference } });
      if (!claimed.count) throw new ConflictException("Authorization was already confirmed");
      await tx.marketplacePurchaseLedger.create({ data: { orderId: id, type: "AUTHORIZATION", amountTmt, externalRef: externalReference, idempotencyKey: `marketplace:${id}:authorization` } });
      return tx.marketplacePurchaseOrder.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    });
    this.audit.record(adminId, "marketplace-purchase.authorization", "MarketplacePurchaseOrder", id, { provider, externalReference, amountTmt });
    return result;
  }

  async confirmRefund(id: string, externalReference: string, adminId: string) {
    const result = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 19))`;
      const order = await tx.marketplacePurchaseOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("Marketplace purchase not found");
      if (order.status === "REFUNDED") return order;
      if (order.status !== "REFUND_PENDING") throw new BadRequestException("Order is not awaiting refund confirmation");
      const amount = Number(order.authorizedTmt) - Number(order.settledTmt) - Number(order.refundedTmt);
      if (amount < 0) throw new ConflictException("Invalid financial totals");
      if (amount > 0) {
        await tx.marketplacePurchaseAccount.upsert({ where: { userId: order.userId }, create: { userId: order.userId, balanceTmt: amount }, update: { balanceTmt: { increment: amount } } });
        await tx.marketplacePurchaseLedger.create({ data: { orderId: id, type: "REFUND_CREDIT", amountTmt: amount, externalRef: externalReference, idempotencyKey: `marketplace:${id}:final-refund` } });
      }
      await tx.marketplacePurchaseOrder.update({ where: { id }, data: { status: "REFUNDED", refundedTmt: { increment: amount } } });
      return tx.marketplacePurchaseOrder.findUniqueOrThrow({ where: { id } });
    });
    this.audit.record(adminId, "marketplace-purchase.refund", "MarketplacePurchaseOrder", id, { externalReference });
    return result;
  }

  async actualWeight(id: string, dto: ActualMarketplaceWeightDto, adminId: string) {
    const result = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 17))`;
      const order = await tx.marketplacePurchaseOrder.findUnique({ where: { id }, include: INCLUDE });
      const exact = order?.quotes.find(quote => quote.weightConfidence === "EXACT");
      if (order && exact) {
        return { version: exact.version, totalTmt: Number(exact.totalTmt), settledTmt: Number(order.settledTmt), refundedTmt: Number(order.refundedTmt) };
      }
      if (!order || !["PURCHASED", "AT_WAREHOUSE"].includes(order.status)) throw new BadRequestException("Order is not at warehouse pricing stage");
      const last = order.quotes.at(-1)!;
      const settings = await tx.marketplacePurchaseSettings.findUniqueOrThrow({ where: { id: "singleton" } });
      const shipping = dto.actualWeightKg * Number(settings.shippingPerKgTmt);
      const total = Math.round((Number(last.productSubtotalTmt) + Number(last.serviceFeeTmt) + shipping) * 100) / 100;
      const version = last.version + 1;
      await tx.marketplacePurchaseQuote.create({ data: { orderId: id, version, productSubtotalTmt: last.productSubtotalTmt, serviceFeeTmt: last.serviceFeeTmt, shippingTmt: shipping, totalTmt: total, fxSnapshot: last.fxSnapshot as Prisma.InputJsonValue, weightKg: dto.actualWeightKg, weightConfidence: "EXACT", expiresAt: new Date(Date.now() + settings.quoteTtlMinutes * 60000) } });
      // Settle and refund against what was actually COLLECTED (authorizedTmt), never against the
      // consented cap (maxAuthorizedTmt). The cap says how much we are allowed to take; it is not
      // money we hold. Refunding `cap - total` credits a wallet with funds nobody ever paid --
      // on a partially wallet-funded order (25 collected against a 100 cap) that mints 75 TMT out
      // of nothing. The cap still governs whether the customer owes more, which is a different
      // question and is answered separately below.
      const collected = Number(order.authorizedTmt);
      const cap = Number(order.maxAuthorizedTmt ?? 0);
      const settled = Math.min(total, collected);
      const refund = Math.max(0, collected - total);
      // Above the cap the customer never consented to the amount; at or under the cap but above
      // what we hold, they consented and simply have not funded it yet. Both need more money
      // before shipping, so both stop at FINAL_PAYMENT_DUE.
      const needsMoreMoney = total > collected || total > cap;
      const claimed = await tx.marketplacePurchaseOrder.updateMany({ where: { id, status: order.status, settledTmt: 0, refundedTmt: 0 }, data: { status: needsMoreMoney ? "FINAL_PAYMENT_DUE" : "READY_TO_SHIP", settledTmt: settled, refundedTmt: refund } });
      if (!claimed.count) throw new ConflictException("Warehouse settlement already applied");
      await tx.marketplacePurchaseLedger.create({ data: { orderId: id, type: "SETTLEMENT", amountTmt: settled, externalRef: order.fundingReference, idempotencyKey: `marketplace:${id}:settlement` } });
      if (refund > 0) {
        await tx.marketplacePurchaseAccount.upsert({ where: { userId: order.userId }, create: { userId: order.userId, balanceTmt: refund }, update: { balanceTmt: { increment: refund } } });
        await tx.marketplacePurchaseLedger.create({ data: { orderId: id, type: "REFUND_CREDIT", amountTmt: refund, externalRef: order.fundingReference, idempotencyKey: `marketplace:${id}:refund` } });
      }
      return { version, totalTmt: total, settledTmt: settled, refundedTmt: refund };
    });
    this.audit.record(adminId, "marketplace-purchase.actual-weight", "MarketplacePurchaseOrder", id, result);
    return result;
  }

  async updateStatus(id: string, status: MarketplacePurchaseStatus, reason: string | undefined, adminId: string) {
    const order = await this.prisma.marketplacePurchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Marketplace purchase not found");
    if (!canTransition(ADMIN_PURCHASE_TRANSITIONS, order.status, status)) throw new BadRequestException(`Cannot move order from ${order.status} to ${status}`);
    if (status === "REFUNDED" || (status === "CANCELLED" && Number(order.authorizedTmt) > 0)) throw new BadRequestException("Financial cancellation/refund requires the dedicated refund workflow");
    // AUTHORIZED asserts "the money is with us". Only confirmAuthorization can establish that: it
    // checks the confirmed amount equals the still-unfunded remainder and writes the AUTHORIZATION
    // ledger row. Reaching it by a plain status change would leave authorizedTmt at whatever the
    // wallet happened to cover, and every downstream settlement would then reason about funds that
    // were never collected.
    if (status === "AUTHORIZED") throw new BadRequestException("AUTHORIZED is set by confirming funding, not by a status change");
    const changed = await this.prisma.marketplacePurchaseOrder.updateMany({ where: { id, status: order.status }, data: { status, reviewReason: reason ?? order.reviewReason } });
    if (!changed.count) throw new ConflictException("Order status changed concurrently");
    this.audit.record(adminId, "marketplace-purchase.status", "MarketplacePurchaseOrder", id, { from: order.status, to: status, reason });
    return this.prisma.marketplacePurchaseOrder.findUniqueOrThrow({ where: { id }, include: INCLUDE });
  }

  async updateSettings(dto: UpdateMarketplacePurchaseSettingsDto, adminId: string) {
    const result = await this.prisma.marketplacePurchaseSettings.update({ where: { id: "singleton" }, data: dto });
    this.audit.record(adminId, "marketplace-purchase.settings", "MarketplacePurchaseSettings", "singleton", dto);
    return result;
  }
}
