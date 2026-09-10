import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { GalleryService } from "./gallery.service";
import { UpsertGalleryCategoryDto } from "./dto/upsert-gallery-category.dto";
import { UpsertGalleryProductDto } from "./dto/upsert-gallery-product.dto";
import { UpsertStorefrontDto } from "./dto/upsert-storefront.dto";
import { CreateGalleryOrderDto } from "./dto/create-gallery-order.dto";
import { UpdateGalleryOrderStatusDto } from "./dto/update-gallery-order-status.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SellersService } from "../sellers/sellers.service";

type AuthedUser = { userId: string; role: string };

@ApiTags("gallery")
@Controller("gallery")
export class GalleryController {
  constructor(
    private gallery: GalleryService,
    private sellers: SellersService,
  ) {}

  // ---- Public ----

  @Get("categories")
  listCategories() {
    return this.gallery.listCategories();
  }

  @Get("products")
  listProducts(
    @Query("categoryId") categoryId?: string,
    @Query("sellerId") sellerId?: string,
    @Query("storefrontId") storefrontId?: string,
    @Query("search") search?: string,
  ) {
    return this.gallery.listProducts({ categoryId, sellerId, storefrontId, search });
  }

  // ---- Customer ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("orders")
  createOrder(@Body() dto: CreateGalleryOrderDto, @CurrentUser() user: AuthedUser) {
    return this.gallery.createOrder(user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("orders/me")
  listMyOrders(@CurrentUser() user: AuthedUser) {
    return this.gallery.listMyOrders(user.userId);
  }

  // ---- Admin: categories ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin/categories")
  listAllCategories() {
    return this.gallery.listAllCategories();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Post("admin/categories")
  createCategory(@Body() dto: UpsertGalleryCategoryDto) {
    return this.gallery.createCategory(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/categories/:id")
  updateCategory(@Param("id") id: string, @Body() dto: Partial<UpsertGalleryCategoryDto>) {
    return this.gallery.updateCategory(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @HttpCode(204)
  @Delete("admin/categories/:id")
  deleteCategory(@Param("id") id: string) {
    return this.gallery.deleteCategory(id);
  }

  // ---- Admin: products ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin/products")
  listAllProducts() {
    return this.gallery.listAllProducts();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Post("admin/products")
  createProduct(@Body() dto: UpsertGalleryProductDto) {
    return this.gallery.createProduct(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/products/:id")
  updateProduct(@Param("id") id: string, @Body() dto: Partial<UpsertGalleryProductDto>) {
    return this.gallery.updateProduct(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @HttpCode(204)
  @Delete("admin/products/:id")
  deleteProduct(@Param("id") id: string) {
    return this.gallery.deleteProduct(id);
  }

  // ---- Admin: orders ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin/orders")
  listAllOrders(@Query("status") status?: string) {
    return this.gallery.listAllOrders(status as never);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/orders/:id/status")
  updateOrderStatus(@Param("id") id: string, @Body() dto: UpdateGalleryOrderStatusDto, @CurrentUser() user: AuthedUser) {
    return this.gallery.updateOrderStatus(id, dto.status, user.userId);
  }

  // ---- Seller self-service ----

  // ---- Seller: the shop's own sections ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Get("seller/storefronts")
  async listMyStorefronts(@CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.gallery.listMyStorefronts(sellerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post("seller/storefronts")
  async createMyStorefront(@Body() dto: UpsertStorefrontDto, @CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.gallery.createMyStorefront(sellerId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Patch("seller/storefronts/:id")
  async updateMyStorefront(
    @Param("id") id: string,
    @Body() dto: Partial<UpsertStorefrontDto>,
    @CurrentUser() user: AuthedUser,
  ) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.gallery.updateMyStorefront(sellerId, id, dto);
  }

  // Answers with how many products moved back to the general list, so the seller is told rather
  // than left to notice. That is why this one is not a 204.
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Delete("seller/storefronts/:id")
  async deleteMyStorefront(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.gallery.deleteMyStorefront(sellerId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Get("seller/products")
  async listMyProducts(@CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.gallery.listMyProducts(sellerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post("seller/products")
  async createMyProduct(@Body() dto: UpsertGalleryProductDto, @CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.gallery.createMyProduct(sellerId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Patch("seller/products/:id")
  async updateMyProduct(
    @Param("id") id: string,
    @Body() dto: Partial<UpsertGalleryProductDto>,
    @CurrentUser() user: AuthedUser,
  ) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.gallery.updateMyProduct(sellerId, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @HttpCode(204)
  @Delete("seller/products/:id")
  async deleteMyProduct(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.gallery.deleteMyProduct(sellerId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Get("seller/orders")
  async listMyOrdersAsSeller(@CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.gallery.listMyOrdersAsSeller(sellerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Patch("seller/orders/:id/status")
  async updateMyOrderStatus(
    @Param("id") id: string,
    @Body() dto: UpdateGalleryOrderStatusDto,
    @CurrentUser() user: AuthedUser,
  ) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.gallery.updateMyOrderStatus(sellerId, id, dto.status, user.userId);
  }
}
