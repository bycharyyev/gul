import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { CatalogService } from "../catalog/catalog.service";
import { OrdersService } from "../orders/orders.service";
import { CreateOrderDto } from "../orders/dto/create-order.dto";
import { ApiKeyGuard } from "./api-key.guard";
import { RequiresScope } from "./api-key-scopes";
import { CurrentApiKey } from "./current-api-key.decorator";
import { DeprecatedVersionInterceptor } from "../common/deprecated-version.interceptor";
import { PARTNER_UNVERSIONED_SUNSET } from "./partner-sunset";

/**
 * Wholesale/reseller surface: external platforms authenticate with an API key
 * (issued in the admin panel under API Keys) instead of a customer JWT, and can
 * place top-up orders programmatically — the same catalog, rates and order
 * pipeline as the consumer app, just a different attribution on the Order row.
 */
@ApiTags("partner")
@ApiHeader({ name: "X-Api-Key", required: true })
@UseGuards(ApiKeyGuard)
// Both paths, one handler. This surface shipped before versioning existed, so somebody's program
// may be pointed at the unversioned one right now; removing it to tidy up would break them with
// no notice. `/api/v1/partner/...` is the address to use, `/api/partner/...` keeps working and
// says so in its response headers until the sunset date.
@UseInterceptors(
  new DeprecatedVersionInterceptor("/api/v1/partner", PARTNER_UNVERSIONED_SUNSET),
)
@Controller({ path: "partner", version: [VERSION_NEUTRAL, "1"] })
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
