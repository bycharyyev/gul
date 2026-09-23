import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface PreferenceInput {
  marketing?: boolean;
  productUpdates?: boolean;
  partnerOffers?: boolean;
}

/**
 * Per-user consent for the optional email categories.
 *
 * Transactional and security mail has no switch here on purpose -- an order receipt or a
 * password-reset code is not something a user can opt out of while holding an account, and
 * offering the toggle would imply otherwise.
 */
@Injectable()
export class EmailPreferenceService {
  constructor(private prisma: PrismaService) {}

  /** Defaults are the answer for a user who has never touched this: marketing off until asked. */
  async get(userId: string) {
    const existing = await this.prisma.emailPreference.findUnique({ where: { userId } });
    return (
      existing ?? {
        userId,
        marketing: false,
        productUpdates: true,
        partnerOffers: false,
        subscriptionSource: null,
        unsubscribedAt: null,
        unsubscribeReason: null,
      }
    );
  }

  async update(userId: string, input: PreferenceInput, source = "account-settings") {
    // Opting back in must clear the unsubscribe stamp, otherwise the send path keeps treating
    // the user as unsubscribed no matter what the checkbox says.
    const clearingUnsubscribe = input.marketing === true;

    return this.prisma.emailPreference.upsert({
      where: { userId },
      create: {
        userId,
        marketing: input.marketing ?? false,
        productUpdates: input.productUpdates ?? true,
        partnerOffers: input.partnerOffers ?? false,
        subscriptionSource: source,
      },
      update: {
        ...input,
        ...(clearingUnsubscribe ? { unsubscribedAt: null, unsubscribeReason: null } : {}),
      },
    });
  }
}
