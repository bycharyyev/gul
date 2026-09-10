import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Length } from "class-validator";

export class CreateOfficialChannelDto {
  @IsIn(["NEWS", "PROMOTIONS", "SECURITY"]) category!: "NEWS" | "PROMOTIONS" | "SECURITY";
}

export class SendChatMessageDto {
  @IsString() @Length(1, 2000) body!: string;
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
