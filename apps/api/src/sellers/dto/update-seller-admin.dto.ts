import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Length } from "class-validator";
import { UpdateSellerDto } from "./update-seller.dto";
import { IsPhone } from "./phone";

/**
 * Staff edit of a shop: the shop fields from UpdateSellerDto plus the owner's contact details.
 * Sellers never get this shape -- their own profile edit still goes through UpdateSellerDto.
 */
export class UpdateSellerAdminDto extends UpdateSellerDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  fullName?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "Некорректный email" })
  email?: string;

  @IsOptional()
  @IsPhone()
  phone?: string;
}
