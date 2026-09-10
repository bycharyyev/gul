import { IsString, MaxLength } from "class-validator";

export class SetDeliveryNoteDto {
  @IsString()
  @MaxLength(2000)
  deliveryNote!: string;
}
