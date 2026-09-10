import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ChatService } from "./chat.service";
import {
  AddChatMembersDto,
  CreateChannelDto,
  CreateChatRoomDto,
  CreateGroupDto,
  CreateOfficialChannelDto,
  SendChatMessageDto,
} from "./dto/chat.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

type AuthedUser = { userId: string; role: string };

@ApiTags("chat")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("chat")
export class ChatController {
  constructor(private chat: ChatService) {}

  // ---- Customer ----

  /** Every conversation this person is in, newest first. Group rooms and existing support and
   *  seller threads arrive in the same shape, so the app renders one list. */
  @Get("inbox")
  inbox(@CurrentUser() user: AuthedUser) {
    return this.chat.inbox(user.userId);
  }

  /** For the badge on the navigation bar; cheap enough to poll on resume. */
  @Get("unread")
  unread(@CurrentUser() user: AuthedUser) {
    return this.chat.unreadTotal(user.userId);
  }

  @Get("rooms/:id/messages")
  messages(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.messages(id, user.userId);
  }

  // A conversation is typed by a person, so the ceiling is generous enough never to interrupt one
  // and low enough that a script cannot fill a room faster than anybody can read it.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("rooms/:id/messages")
  send(
    @Param("id") id: string,
    @Body() dto: SendChatMessageDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.chat.send(id, user.userId, dto.body);
  }

  @Post("rooms/:id/read")
  markRead(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.markRead(id, user.userId);
  }

  // ---- Groups ----

  /** Anybody may make one. Answers with the room and the code its share link carries. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("groups")
  createGroup(@Body() dto: CreateGroupDto, @CurrentUser() user: AuthedUser) {
    return this.chat.createGroup(user.userId, dto.title);
  }

  /** Members, and the invite link. Members only. */
  @Get("groups/:id")
  groupInfo(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.groupInfo(id, user.userId);
  }

  @Post("groups/:id/invite/rotate")
  rotateInvite(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.rotateInvite(id, user.userId);
  }

  @Post("groups/:id/leave")
  leaveGroup(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.leaveGroup(id, user.userId);
  }

  @Delete("groups/:id")
  deleteGroup(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.deleteGroup(id, user.userId);
  }

  /** What the link shows before somebody commits to joining. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get("invites/:code")
  invitePreview(@Param("code") code: string, @CurrentUser() user: AuthedUser) {
    return this.chat.invitePreview(code, user.userId);
  }

  // Throttled harder than the rest: a code is short enough to be worth guessing at machine speed,
  // and this is the only endpoint where a guess would pay off.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("invites/:code/join")
  joinByInvite(@Param("code") code: string, @CurrentUser() user: AuthedUser) {
    return this.chat.joinByInvite(code, user.userId);
  }

  // ---- Channels ----

  /** Channels anybody can subscribe to, with a flag for the ones this person already follows. */
  @Get("channels")
  channels(@CurrentUser() user: AuthedUser) {
    return this.chat.listChannels(user.userId);
  }

  @UseGuards(RolesGuard)
  @Roles("SELLER")
  @Post("channels")
  createChannel(@Body() dto: CreateChannelDto, @CurrentUser() user: AuthedUser) {
    return this.chat.createChannel(user.userId, dto.title, dto.description);
  }

  @Post("channels/:id/subscribe")
  subscribe(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.subscribe(id, user.userId);
  }

  @Post("channels/:id/unsubscribe")
  unsubscribe(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.unsubscribe(id, user.userId);
  }

  /** Opens (creating if needed) this customer's conversation with one shop, and answers with the
   *  id the conversation screen takes. */
  @Post("with-seller/:sellerId")
  withSeller(@Param("sellerId") sellerId: string, @CurrentUser() user: AuthedUser) {
    return this.chat.conversationWithSeller(user.userId, sellerId);
  }

  // The same three operations for an existing support or seller thread, so the app has one
  // conversation screen rather than one per storage shape.

  @Get("threads/:id/messages")
  threadMessages(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.threadMessages(id, user.userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("threads/:id/messages")
  sendToThread(
    @Param("id") id: string,
    @Body() dto: SendChatMessageDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.chat.sendToThread(id, user.userId, dto.body);
  }

  @Post("threads/:id/read")
  markThreadRead(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.markThreadRead(id, user.userId);
  }

  // ---- Admin ----

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Post("admin/official-channels")
  createOfficialChannel(@Body() dto: CreateOfficialChannelDto, @CurrentUser() user: AuthedUser) {
    return this.chat.createOfficialChannel(user.userId, dto.category);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin/official-channels/:id/messages")
  officialMessages(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.chat.officialMessages(id, user.userId);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("admin/official-channels/:id/messages")
  publishOfficial(@Param("id") id: string, @Body() dto: SendChatMessageDto, @CurrentUser() user: AuthedUser) {
    return this.chat.publishOfficial(id, user.userId, dto.body);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin/rooms")
  adminRooms() {
    return this.chat.adminRooms();
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Post("admin/rooms")
  createRoom(@Body() dto: CreateChatRoomDto, @CurrentUser() user: AuthedUser) {
    return this.chat.createRoom(dto.title, dto.memberIds, user.userId);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Post("admin/rooms/:id/members")
  addMembers(@Param("id") id: string, @Body() dto: AddChatMembersDto) {
    return this.chat.addMembers(id, dto.memberIds);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Delete("admin/rooms/:id/members/:userId")
  removeMember(@Param("id") id: string, @Param("userId") userId: string) {
    return this.chat.removeMember(id, userId);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @Delete("admin/rooms/:id")
  deleteRoom(@Param("id") id: string) {
    return this.chat.adminDeleteRoom(id);
  }
}
