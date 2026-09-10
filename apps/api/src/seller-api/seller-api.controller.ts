import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { ApiKeyGuard } from "../partner/api-key.guard";
import { RequiresScope } from "../partner/api-key-scopes";
import { CurrentApiKey, type AuthedApiKey } from "../partner/current-api-key.decorator";
import { ShopKeyGuard } from "./shop-key.guard";
import { GalleryService } from "../gallery/gallery.service";
import { ChatService } from "../chat/chat.service";
import { SellersService } from "../sellers/sellers.service";
import { UpsertGalleryProductDto } from "../gallery/dto/upsert-gallery-product.dto";
import { UpsertStorefrontDto } from "../gallery/dto/upsert-storefront.dto";
import { UpdateGalleryOrderStatusDto } from "../gallery/dto/update-gallery-order-status.dto";
import { SendChatMessageDto } from "../chat/dto/chat.dto";
import { CreateChannelDto } from "../chat/dto/chat.dto";

/**
 * The Seller API: one token, everything a shop owns.
 *
 * The shop is read off the key on every route and never from a parameter, so there is no request
 * that reaches another shop's data -- the usual mistake in an API like this is a `sellerId` in
 * the path that somebody forgets to check.
 *
 * Reuses the same services the seller cabinet calls, deliberately: a second implementation of
 * "create a product" is a second set of rules about SKUs, prices and which shelf a product may
 * go on, and the two would drift apart within a release.
 *
 * Excluded from the main Swagger document. This surface has its own written documentation aimed
 * at somebody integrating against it, and burying it among two hundred internal routes would be
 * worse than not listing it at all.
 */
@ApiExcludeController()
@UseGuards(ApiKeyGuard, ShopKeyGuard)
@Controller("seller-api")
export class SellerApiController {
  constructor(
    private gallery: GalleryService,
    private chat: ChatService,
    private sellers: SellersService,
  ) {}

  /**
   * The shop this key acts for.
   *
   * First call in every integration: it proves the token works and says which shop it reached,
   * before anything has been created or changed.
   */
  @RequiresScope("products:read")
  @Get("me")
  async me(@CurrentApiKey() key: AuthedApiKey) {
    const shop = await this.sellers.getShopForKey(key.sellerId!);
    return { ...shop, keyName: key.ownerLabel };
  }

  // ---- Products ----

  @RequiresScope("products:read")
  @Get("products")
  listProducts(@CurrentApiKey() key: AuthedApiKey) {
    return this.gallery.listMyProducts(key.sellerId!);
  }

  @RequiresScope("products:read")
  @Get("products/:id")
  getProduct(@Param("id") id: string, @CurrentApiKey() key: AuthedApiKey) {
    return this.gallery.getMyProduct(key.sellerId!, id);
  }

  @RequiresScope("products:write")
  @Post("products")
  createProduct(@Body() dto: UpsertGalleryProductDto, @CurrentApiKey() key: AuthedApiKey) {
    return this.gallery.createMyProduct(key.sellerId!, dto);
  }

  @RequiresScope("products:write")
  @Patch("products/:id")
  updateProduct(
    @Param("id") id: string,
    @Body() dto: Partial<UpsertGalleryProductDto>,
    @CurrentApiKey() key: AuthedApiKey,
  ) {
    return this.gallery.updateMyProduct(key.sellerId!, id, dto);
  }

  @RequiresScope("products:write")
  @HttpCode(204)
  @Delete("products/:id")
  deleteProduct(@Param("id") id: string, @CurrentApiKey() key: AuthedApiKey) {
    return this.gallery.deleteMyProduct(key.sellerId!, id);
  }

  // ---- Storefronts ----

  @RequiresScope("products:read")
  @Get("storefronts")
  listStorefronts(@CurrentApiKey() key: AuthedApiKey) {
    return this.gallery.listMyStorefronts(key.sellerId!);
  }

  @RequiresScope("products:write")
  @Post("storefronts")
  createStorefront(@Body() dto: UpsertStorefrontDto, @CurrentApiKey() key: AuthedApiKey) {
    return this.gallery.createMyStorefront(key.sellerId!, dto);
  }

  @RequiresScope("products:write")
  @Patch("storefronts/:id")
  updateStorefront(
    @Param("id") id: string,
    @Body() dto: Partial<UpsertStorefrontDto>,
    @CurrentApiKey() key: AuthedApiKey,
  ) {
    return this.gallery.updateMyStorefront(key.sellerId!, id, dto);
  }

  @RequiresScope("products:write")
  @Delete("storefronts/:id")
  deleteStorefront(@Param("id") id: string, @CurrentApiKey() key: AuthedApiKey) {
    return this.gallery.deleteMyStorefront(key.sellerId!, id);
  }

  // ---- Orders ----

  @RequiresScope("shop-orders:read")
  @Get("orders")
  listOrders(@CurrentApiKey() key: AuthedApiKey) {
    return this.gallery.listMyOrdersAsSeller(key.sellerId!);
  }

  /**
   * Moves an order along.
   *
   * The same state machine the cabinet uses -- a key cannot jump an order to DELIVERED from
   * nowhere, because "which transitions are allowed" is a rule about orders, not about who is
   * asking.
   */
  @RequiresScope("shop-orders:write")
  @Patch("orders/:id/status")
  async updateOrderStatus(
    @Param("id") id: string,
    @Body() dto: UpdateGalleryOrderStatusDto,
    @CurrentApiKey() key: AuthedApiKey,
  ) {
    const ownerUserId = await this.sellers.ownerUserId(key.sellerId!);
    return this.gallery.updateMyOrderStatus(key.sellerId!, id, dto.status, ownerUserId);
  }

  // ---- Channels ----

  @RequiresScope("chat:read")
  @Get("channels")
  listChannels(@CurrentApiKey() key: AuthedApiKey) {
    return this.chat.shopChannels(key.sellerId!);
  }

  @RequiresScope("chat:write")
  @Post("channels")
  createChannel(@Body() dto: CreateChannelDto, @CurrentApiKey() key: AuthedApiKey) {
    return this.chat.createShopChannel(key.sellerId!, dto.title, dto.description);
  }

  @RequiresScope("chat:read")
  @Get("channels/:id/messages")
  channelMessages(
    @Param("id") id: string,
    @Query("limit") limit: string | undefined,
    @CurrentApiKey() key: AuthedApiKey,
  ) {
    return this.chat.shopChannelMessages(key.sellerId!, id, toLimit(limit));
  }

  @RequiresScope("chat:write")
  @Post("channels/:id/messages")
  postToChannel(
    @Param("id") id: string,
    @Body() dto: SendChatMessageDto,
    @CurrentApiKey() key: AuthedApiKey,
  ) {
    return this.chat.postToShopChannel(key.sellerId!, id, dto.body);
  }

  // ---- Customer conversations ----

  @RequiresScope("chat:read")
  @Get("chats")
  listChats(@Query("limit") limit: string | undefined, @CurrentApiKey() key: AuthedApiKey) {
    return this.chat.shopThreads(key.sellerId!, toLimit(limit, 50));
  }

  @RequiresScope("chat:read")
  @Get("chats/:id/messages")
  chatMessages(
    @Param("id") id: string,
    @Query("limit") limit: string | undefined,
    @CurrentApiKey() key: AuthedApiKey,
  ) {
    return this.chat.shopThreadMessages(key.sellerId!, id, toLimit(limit));
  }

  @RequiresScope("chat:write")
  @Post("chats/:id/messages")
  replyToChat(
    @Param("id") id: string,
    @Body() dto: SendChatMessageDto,
    @CurrentApiKey() key: AuthedApiKey,
  ) {
    return this.chat.shopReplyToThread(key.sellerId!, id, dto.body);
  }
}

/** A query-string number, or the default. Anything unparseable is somebody's typo, not a zero. */
function toLimit(raw: string | undefined, fallback = 100): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
