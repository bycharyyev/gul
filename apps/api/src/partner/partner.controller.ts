import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { CatalogService } from "../catalog/catalog.service";
import { OrdersService } from "../orders/orders.service";
import { CreateOrderDto } from "../orders/dto/create-order.dto";
import { ApiKeyGuard } from "./api-key.guard";
import { RequiresScope } from "./api-key-scopes";
import { CurrentApiKey } from "./current-api-key.decorator";

/**
 * Wholesale/reseller surface: external platforms authenticate with an API key
 * (issued in the admin panel under API Keys) instead of a customer JWT, and can
 * place top-up orders programmatically — the same catalog, rates and order
 * pipeline as the consumer app, just a different attribution on the Order row.
 */
@ApiTags("partner")
@ApiHeader({ name: "X-Api-Key", required: true })
@UseGuards(ApiKeyGuard)
@Controller("partner")
export class PartnerController {
  constructor(
    private catalog: CatalogService,
    private orders: OrdersService,
  ) {}

  @RequiresScope("catalog:read")
  @Get("catalog/services")
  listServices() {
    return this.catalog.listServices();
  }

  @RequiresScope("catalog:read")
  @Get("catalog/services/:id/rates")
  listRates(@Param("id") id: string) {
    return this.catalog.listRates(id);
  }

  @RequiresScope("catalog:read")
  @Get("catalog/payment-methods")
  listPaymentMethods() {
    return this.catalog.listPaymentMethods();
  }

  @RequiresScope("orders:write")
  @Post("orders")
  createOrder(@Body() dto: CreateOrderDto, @CurrentApiKey() apiKey: { id: string }) {
    return this.orders.create({ apiKeyId: apiKey.id }, dto);
  }

  @RequiresScope("orders:read")
  @Get("orders/:id")
  getOrder(@Param("id") id: string, @CurrentApiKey() apiKey: { id: string }) {
    return this.orders.findOneForApiKey(id, apiKey.id);
  }
}
