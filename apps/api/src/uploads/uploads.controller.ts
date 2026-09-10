import * as fs from "node:fs";
import {
  BadRequestException,
  Controller,
  Get,
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
import { UploadsService } from "./uploads.service";
import {
  ALLOWED_UPLOAD_IMAGE_MIME_TYPES,
  ALLOWED_UPLOAD_MEDIA_MIME_TYPES,
  MAX_UPLOAD_IMAGE_SIZE_BYTES,
  MAX_UPLOAD_MEDIA_SIZE_BYTES,
} from "./uploads.constants";

@ApiTags("uploads")
@Controller("uploads")
export class UploadsController {
  constructor(private uploads: UploadsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("image")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_UPLOAD_IMAGE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_UPLOAD_IMAGE_MIME_TYPES[file.mimetype]) {
          cb(new BadRequestException("Unsupported file type"), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.uploads.upload(file);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("media")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_UPLOAD_MEDIA_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_UPLOAD_MEDIA_MIME_TYPES[file.mimetype]) {
          cb(new BadRequestException("Unsupported file type"), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.uploads.uploadMedia(file);
  }

  // Local-disk-fallback serving only (no S3 configured) -- public, mirrors avatar's serve route.
  @Get(":storedName")
  serve(@Param("storedName") storedName: string, @Res() res: Response) {
    const filePath = this.uploads.resolveFilePath(storedName);
    if (!fs.existsSync(filePath)) throw new NotFoundException("File not found");
    res.sendFile(filePath);
  }
}
