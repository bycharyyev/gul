import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SupportService } from "./support.service";
import { SendMessageDto } from "./dto/send-message.dto";
import { UpdateThreadStatusDto } from "./dto/update-thread-status.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SellersService } from "../sellers/sellers.service";

type AuthedUser = { userId: string; role: string };

@ApiTags("support")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("support")
export class SupportController {
  constructor(
    private support: SupportService,
    private sellers: SellersService,
  ) {}

  // ---- Customer: platform support ----

  @Get("thread")
  myThread(@CurrentUser() user: AuthedUser) {
    return this.support.getMyThread(user.userId);
  }

  @Post("thread/messages")
  sendMessage(@Body() dto: SendMessageDto, @CurrentUser() user: AuthedUser) {
    return this.support.sendCustomerMessage(user.userId, dto.body);
  }

  // ---- Customer: chat with a specific seller ----

  @Get("seller/:sellerId/thread")
  myThreadWithSeller(@Param("sellerId") sellerId: string, @CurrentUser() user: AuthedUser) {
    return this.support.getMyThread(user.userId, sellerId);
  }

  @Post("seller/:sellerId/thread/messages")
  sendMessageToSeller(
    @Param("sellerId") sellerId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.support.sendCustomerMessage(user.userId, dto.body, sellerId);
  }

  // ---- Staff: platform support inbox ----

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "SUPPORT")
  @Get("admin/threads")
  listThreads() {
    return this.support.listThreadsForStaff();
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "SUPPORT")
  @Get("admin/threads/:id")
  getThread(@Param("id") id: string) {
    return this.support.getThreadForStaff(id);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "SUPPORT")
  @Post("admin/threads/:id/messages")
  staffReply(@Param("id") id: string, @Body() dto: SendMessageDto, @CurrentUser() user: AuthedUser) {
    return this.support.sendStaffMessage(id, user.userId, dto.body);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "SUPPORT")
  @Patch("admin/threads/:id")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateThreadStatusDto) {
    return this.support.setThreadStatus(id, dto.status);
  }

  // ---- Seller: shop inbox ----

  @UseGuards(RolesGuard)
  @Roles("SELLER")
  @Get("seller-inbox/threads")
  async listSellerThreads(@CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.support.listThreadsForSeller(sellerId);
  }

  @UseGuards(RolesGuard)
  @Roles("SELLER")
  @Get("seller-inbox/unread-count")
  async getSellerUnreadCount(@CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.support.getUnreadCountForSeller(sellerId);
  }

  @UseGuards(RolesGuard)
  @Roles("SELLER")
  @Get("seller-inbox/threads/:id")
  async getSellerThread(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.support.getThreadForSeller(sellerId, id);
  }

  @UseGuards(RolesGuard)
  @Roles("SELLER")
  @Post("seller-inbox/threads/:id/messages")
  async sellerReply(@Param("id") id: string, @Body() dto: SendMessageDto, @CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.support.sendSellerMessage(sellerId, id, user.userId, dto.body);
  }
}
