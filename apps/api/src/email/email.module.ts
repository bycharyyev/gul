import { Module } from "@nestjs/common";
import { EmailController } from "./email.controller";
import { UnsubscribeController } from "./unsubscribe.controller";
import { EmailService } from "./email.service";
import { EmailProcessor } from "./email.processor";
import { EmailTemplateService } from "./email-template.service";
import { EmailQuotaService } from "./email-quota.service";
import { EmailSuppressionService } from "./email-suppression.service";
import { EmailOutboxService } from "./email-outbox.service";
import { EmailOutboxProcessor } from "./email-outbox.processor";
import { EmailAlertService } from "./email-alert.service";
import { EmailAlertProcessor } from "./email-alert.processor";
import { EmailPreferenceService } from "./email-preference.service";
import { EmailRetentionProcessor } from "./email-retention.processor";
import { EmailVerificationService } from "./email-verification.service";
import { EmailVerificationController } from "./email-verification.controller";
import { EmailTemplateController } from "./email-template.controller";

@Module({
  controllers: [EmailController, UnsubscribeController, EmailVerificationController, EmailTemplateController],
  providers: [EmailService, EmailProcessor, EmailTemplateService, EmailVerificationService, EmailQuotaService, EmailSuppressionService, EmailOutboxService, EmailOutboxProcessor, EmailAlertService, EmailAlertProcessor, EmailPreferenceService, EmailRetentionProcessor],
  exports: [EmailService, EmailTemplateService, EmailQuotaService, EmailSuppressionService, EmailOutboxService, EmailAlertService],
})
export class EmailModule {}
