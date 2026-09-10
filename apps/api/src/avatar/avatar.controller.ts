import * as fs from "node:fs";
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AvatarService } from "./avatar.service";
import { ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_SIZE_BYTES } from "./avatar.constants";

type AuthedUser = { userId: string };

@ApiTags("avatar")
@Controller("avatar")
export class AvatarController {
  constructor(private avatar: AvatarService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_AVATAR_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_AVATAR_MIME_TYPES[file.mimetype]) {
          cb(new BadRequestException("Unsupported file type"), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthedUser) {
    if (!file) throw new BadRequestException("No file provided");
    return this.avatar.upload(user.userId, file);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Delete()
  remove(@CurrentUser() user: AuthedUser) {
    return this.avatar.remove(user.userId);
  }

  // Intentionally public (no auth guard) -- avatars are meant to be embeddable directly
  // via <img src>, and the stored filename carries no user identity or secret data.
  @Get(":storedName")
  serve(@Param("storedName") storedName: string, @Res() res: Response) {
    const filePath = this.avatar.resolveFilePath(storedName);
    if (!fs.existsSync(filePath)) throw new NotFoundException("Avatar not found");
    res.sendFile(filePath);
  }
}
