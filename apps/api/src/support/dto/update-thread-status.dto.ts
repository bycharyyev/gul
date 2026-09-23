import { IsEnum } from "class-validator";
import { SUPPORT_THREAD_STATUSES, type SupportThreadStatus } from "@topup-hub/types";

export class UpdateThreadStatusDto {
  @IsEnum(SUPPORT_THREAD_STATUSES)
  status!: SupportThreadStatus;
}
