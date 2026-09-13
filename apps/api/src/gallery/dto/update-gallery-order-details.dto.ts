import { IsOptional, IsString, Length } from "class-validator";

/** Staff correcting what the buyer typed -- a wrong flat number, a phone digit -- never the
 * product or the amount, which are what the customer actually paid for. */
export class UpdateGalleryOrderDetailsDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @Length(3, 32)
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  deliveryCity?: string;

  @IsOptional()
  @IsString()
  @Length(1, 300)
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  cardMessage?: string;
}
