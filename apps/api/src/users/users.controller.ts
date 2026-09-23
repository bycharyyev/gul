import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { CreateStaffUserDto } from "./dto/create-staff-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
@Controller("users")
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  listStaff() {
    return this.users.listStaff();
  }

  @Post()
  createStaff(@Body() dto: CreateStaffUserDto, @CurrentUser() user: { userId: string; role: string }) {
    return this.users.createStaff(dto, user.userId);
  }

  @Get("customers")
  listCustomers(@Query("search") search?: string) {
    return this.users.listCustomers(search);
  }

  @Get("customers/stats")
  getCustomerStats() {
    return this.users.getCustomerStats();
  }

  @Get("customers/:id")
  getCustomerDetail(@Param("id") id: string) {
    return this.users.getCustomerDetail(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.users.updateUser(id, dto, user.userId);
  }

  @HttpCode(204)
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return this.users.deleteUser(id, user.userId);
  }
}
