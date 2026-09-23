import { IsDateString, IsOptional, IsString, Length } from "class-validator";

export class CreatePickupRequestDto {
  @IsString()
  @Length(1, 500)
  address!: string;

  @IsDateString()
  requestedDate!: string;

  // Free text for v1 ("10:00-14:00") -- there's no slot-booking system to validate a structured
  // window against yet. See docs/CARGO/ASSUMPTIONS.md.
  @IsString()
  @Length(1, 60)
  timeWindow!: string;

  @IsString()
  @Length(6, 20)
  phone!: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  notes?: string;
}
