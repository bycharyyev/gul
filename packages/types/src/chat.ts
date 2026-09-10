/** A group room or channel as the admin console sees it. */
export interface ChatRoomAdminDto {
  officialCategory?: ChatOfficialCategory | null;
  id: string;
  /**
   * Which of the three things this room is. The console needs it to say who answers for the
   * room: a staff group is ours, a channel belongs to a shop, and a group somebody made for
   * their own friends is theirs.
   */
  kind: "GROUP" | "CHANNEL";
  title: string;
  createdById: string;
  /** Who made it. Null only if the account has since been removed. */
  createdBy: {
    id: string;
    fullName: string | null;
    username: string | null;
  } | null;
  /** The shop a channel speaks for. Null for every group. */
  seller: { id: string; shopName: string } | null;
  /**
   * Whether the room has a live invite link. The code itself is deliberately not sent: a console
   * that showed it would let staff walk into any private group without anybody knowing.
   */
  hasInvite: boolean;
  lastMessageAt: string;
  createdAt: string;
  _count: { members: number; messages: number };
}

export interface CreateChatRoomInput {
  title: string;
  memberIds: string[];
}

export type ChatOfficialCategory = "NEWS" | "PROMOTIONS" | "SECURITY";
export interface ChatInboxEntryDto {
  id: string;
  kind: "GROUP" | "CHANNEL" | "SELLER" | "SUPPORT";
  title: string;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
  officialCategory?: ChatOfficialCategory | null;
}
export interface ChatMessageDto {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  senderRole?: string;
  author?: {
    id: string;
    fullName: string | null;
    username: string | null;
    avatarPath: string | null;
  } | null;
}
export interface ChatConversationDto {
  room: {
    id: string;
    title: string;
    kind: "GROUP" | "CHANNEL" | "THREAD";
    canPost: boolean;
    officialCategory?: ChatOfficialCategory | null;
  };
  messages: ChatMessageDto[];
}
export interface ChatChannelDto {
  id: string;
  title: string;
  description: string | null;
  shopName: string | null;
  subscriberCount: number;
  lastMessageAt: string;
  subscribed: boolean;
  officialCategory?: ChatOfficialCategory | null;
}
export interface ChatGroupInfoDto {
  id: string;
  title: string;
  isOwner: boolean;
  inviteCode: string | null;
  members: {
    id: string;
    name: string;
    avatarPath: string | null;
    isOwner: boolean;
    joinedAt: string;
  }[];
}
