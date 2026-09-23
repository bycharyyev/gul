import { IsIn, IsOptional, IsString } from "class-validator";

export class ReportSubdomainStatusDto {
  @IsString()
  name!: string;

  @IsIn(["ACTIVE", "FAILED", "REMOVED"])
  status!: "ACTIVE" | "FAILED" | "REMOVED";

  @IsOptional()
  @IsString()
  lastError?: string;
}
