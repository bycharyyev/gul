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
import { DocumentsService } from "./documents.service";
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES } from "./documents.constants";

type AuthedUser = { userId: string };

const ALLOWED_MIME_LIST: readonly string[] = ALLOWED_DOCUMENT_MIME_TYPES;

// Note: @nestjs/platform-express's FileInterceptor already converts Multer's raw errors
// into proper HttpExceptions (LIMIT_FILE_SIZE -> 413 PayloadTooLargeException, etc.) —
// see multer.utils.js `transformException` — so no custom exception filter is needed here.

@ApiTags("documents")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("documents")
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: AuthedUser) {
    return this.documents.listMine(user.userId);
  }

  @Post()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_LIST.includes(file.mimetype)) {
          cb(new BadRequestException("Unsupported file type"), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthedUser) {
    if (!file) throw new BadRequestException("No file provided");
    return this.documents.upload(user.userId, file);
  }

  @Get(":id")
  async download(@Param("id") id: string, @CurrentUser() user: AuthedUser, @Res() res: Response) {
    const doc = await this.documents.getOwned(user.userId, id);
    if (doc.storageBackend === "s3") {
      // Ownership is already checked above; the presigned URL itself is only valid ~60s,
      // so a 302 here (rather than proxying the bytes through the API) is safe to hand back.
      const url = await this.documents.presignedUrl(doc);
      res.redirect(url);
      return;
    }
    const filePath = this.documents.filePath(doc);
    if (!fs.existsSync(filePath)) throw new NotFoundException("Document not found");
    // storedName has no extension, so Express can't infer Content-Type from the path —
    // set it explicitly from the DB record instead of letting it fall back to octet-stream.
    res.download(filePath, doc.originalName, { headers: { "Content-Type": doc.mimeType } });
  }

  @HttpCode(204)
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.documents.remove(user.userId, id);
  }
}
