/** A group room or channel as the admin console sees it. */
export interface ChatRoomAdminDto {
  verification?: { id: string; status: "PENDING" | "APPROVED" | "REJECTED"; note: string | null } | null;
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

/** One verification request as the admin moderation queue sees it. */
export interface ChatVerificationRequestAdminDto {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  createdAt: string;
  room: {
    id: string;
    title: string;
    kind: "GROUP" | "CHANNEL";
    createdById: string;
    sellerId: string | null;
  };
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
  /** The room's picture, if it has one; clients fall back to an initial-letter avatar. */
  imageUrl?: string | null;
  /** Platform support and official channels always; a shop channel once moderation approves it. */
  isVerified?: boolean;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
  officialCategory?: ChatOfficialCategory | null;
}
/** A file being sent with a message: a photo, a video or a document, up to 30MB. This is the
 *  request shape -- what comes back on a message is the flat attachment* fields below, which is
 *  how the columns are stored. */
export interface ChatAttachmentInput {
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ChatMessageDto {
  id: string;
  /** Empty when the message is nothing but its attachment. */
  body: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
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
    imageUrl?: string | null;
    canPost: boolean;
    officialCategory?: ChatOfficialCategory | null;
  };
  messages: ChatMessageDto[];
}
export interface ChatChannelDto {
  id: string;
  title: string;
  imageUrl?: string | null;
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
  imageUrl?: string | null;
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
