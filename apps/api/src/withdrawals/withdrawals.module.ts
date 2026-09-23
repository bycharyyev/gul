import { Module } from "@nestjs/common";
import { WithdrawalsController } from "./withdrawals.controller";
import { WithdrawalsService } from "./withdrawals.service";
import { SellersModule } from "../sellers/sellers.module";
import { TelegramBotModule } from "../telegram-bot/telegram-bot.module";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [SellersModule, TelegramBotModule, EmailModule],
  controllers: [WithdrawalsController],
  providers: [WithdrawalsService],
})
export class WithdrawalsModule {}
