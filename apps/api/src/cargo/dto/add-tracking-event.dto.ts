import { IsOptional, IsString, Length } from "class-validator";

// Appends a customer-visible note without moving the status -- e.g. "customs delay expected, no
// change yet" is real, useful information that isn't a status transition.
export class AddTrackingEventDto {
  @IsString()
  @Length(1, 1000)
  note!: string;
}
