import { Global, Module } from "@nestjs/common";
import { SellerLedgerController } from "./seller-ledger.controller";
import { SellerLedgerService } from "./seller-ledger.service";

@Global()
@Module({
  controllers: [SellerLedgerController],
  providers: [SellerLedgerService],
  exports: [SellerLedgerService],
})
export class SellerLedgerModule {}
