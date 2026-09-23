import { IsInt, IsOptional, IsString, Length, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

/** An already-uploaded file (POST /uploads/attachment), echoed back so it can be stored with the
 *  message. Re-validated server-side -- see validateAttachment. */
export class SupportAttachmentDto {
  @IsString() @Length(1, 2000) url!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsString() @Length(1, 120) mimeType!: string;
  @IsInt() @Min(1) size!: number;
}

export class SendMessageDto {
  // Length(0, ...): a message may be nothing but its attachment. A body that is blank with
  // nothing attached is refused in the service.
  @IsString()
  @Length(0, 2000)
  body!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SupportAttachmentDto)
  attachment?: SupportAttachmentDto;
}
