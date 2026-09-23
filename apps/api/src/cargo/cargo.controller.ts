import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CargoService } from "./cargo.service";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { CreateShipmentDto } from "./dto/create-shipment.dto";
import { CreatePickupRequestDto } from "./dto/create-pickup-request.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

type AuthedUser = { userId: string; role: string };

@ApiTags("cargo")
@Controller("cargo")
export class CargoController {
  constructor(private cargo: CargoService) {}

  /** One call returns both city lists, the priced cargo types and the weight brackets -- a client
   *  that had to fan out to three endpoints to draw one form would render it half-populated. */
  @Get("directions")
  directions() {
    return this.cargo.listDirections();
  }

  @Get("banners")
  banners() {
    return this.cargo.listBannersPublic();
  }

  @Post("quote")
  quote(@Body() dto: CreateQuoteDto) {
    return this.cargo.quote(dto);
  }

  @Get("track/:trackingNumber")
  track(@Param("trackingNumber") trackingNumber: string) {
    return this.cargo.track(trackingNumber);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("shipments")
  create(@Body() dto: CreateShipmentDto, @CurrentUser() user: AuthedUser) {
    return this.cargo.createShipment(user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("shipments/me")
  mine(@CurrentUser() user: AuthedUser) {
    return this.cargo.findMine(user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("shipments/:id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.cargo.findOne(id, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("shipments/:id/pickup")
  requestPickup(@Param("id") id: string, @Body() dto: CreatePickupRequestDto, @CurrentUser() user: AuthedUser) {
    return this.cargo.requestPickup(id, user.userId, dto);
  }
}
