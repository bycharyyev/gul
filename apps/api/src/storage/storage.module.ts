import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { UploadCleanupService } from "./upload-cleanup.service";

@Global()
@Module({
  providers: [StorageService, UploadCleanupService],
  exports: [StorageService, UploadCleanupService],
})
export class StorageModule {}
