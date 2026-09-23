import { IsEnum } from "class-validator";
import { GALLERY_ORDER_STATUSES, type GalleryOrderStatus } from "@topup-hub/types";

export class UpdateGalleryOrderStatusDto {
  @IsEnum(GALLERY_ORDER_STATUSES)
  status!: GalleryOrderStatus;
}
