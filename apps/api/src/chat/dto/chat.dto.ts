import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class CreateOfficialChannelDto {
  @IsIn(["NEWS", "PROMOTIONS", "SECURITY"]) category!: "NEWS" | "PROMOTIONS" | "SECURITY";
}

/** An already-uploaded file (POST /uploads/attachment), echoed back so it can be stored with the
 *  message. Re-validated server-side -- see validateAttachment. */
export class ChatAttachmentDto {
  @IsString() @Length(1, 2000) url!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsString() @Length(1, 120) mimeType!: string;
  @IsInt() @Min(1) size!: number;
}

export class SendChatMessageDto {
  // Length(0, ...): a message may be nothing but its attachment, and the service refuses a body
  // that is blank with nothing attached.
  @IsString() @Length(0, 2000) body!: string;
  @IsOptional() @ValidateNested() @Type(() => ChatAttachmentDto) attachment?: ChatAttachmentDto;
}

export class CreateChatRoomDto {
  @IsString() @Length(1, 120) title!: string;
  // A cap, not a guess: a room is a conversation, and a hundred people in one is already a
  // broadcast channel with none of the controls a broadcast needs.
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({ each: true }) memberIds!: string[];
}

export class AddChatMembersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({ each: true }) memberIds!: string[];
}

export class CreateChannelDto {
  @IsString() @Length(1, 120) title!: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
}

export class CreateGroupDto {
  @IsString() @Length(1, 120) title!: string;
}

export class ChatVerificationRequestDto {
  @IsString() @Length(1, 500) note!: string;
}

export class ReviewChatVerificationDto {
  @IsIn(["APPROVED", "REJECTED"]) status!: "APPROVED" | "REJECTED";
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

/** Null clears the picture and goes back to the initial-letter avatar. */
export class SetChatRoomImageDto {
  @IsOptional() @IsString() @Length(0, 2000) imageUrl?: string | null;
}
