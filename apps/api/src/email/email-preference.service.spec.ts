import { EmailPreferenceService } from "./email-preference.service";

function makePrisma(existing: unknown = null) {
  return {
    emailPreference: {
      findUnique: jest.fn().mockResolvedValue(existing),
      upsert: jest.fn().mockImplementation(({ create, update }) => Promise.resolve({ ...create, ...update })),
    },
  };
}

describe("EmailPreferenceService", () => {
  it("treats a user who never touched preferences as not opted in to marketing", async () => {
    const service = new EmailPreferenceService(makePrisma() as never);
    const prefs = await service.get("u1");
    expect(prefs.marketing).toBe(false);
    expect(prefs.productUpdates).toBe(true);
  });

  it("returns the stored row when one exists", async () => {
    const stored = { userId: "u1", marketing: true, productUpdates: false, partnerOffers: false };
    const service = new EmailPreferenceService(makePrisma(stored) as never);
    expect(await service.get("u1")).toEqual(stored);
  });

  it("clears the unsubscribe stamp when the user opts back in", async () => {
    const prisma = makePrisma();
    const service = new EmailPreferenceService(prisma as never);

    await service.update("u1", { marketing: true });

    // Without this the send path keeps treating them as unsubscribed no matter what the
    // checkbox says, and the user has no way to notice.
    expect(prisma.emailPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ marketing: true, unsubscribedAt: null, unsubscribeReason: null }),
      }),
    );
  });

  it("does not touch the unsubscribe stamp when opting out", async () => {
    const prisma = makePrisma();
    const service = new EmailPreferenceService(prisma as never);

    await service.update("u1", { marketing: false });

    const update = prisma.emailPreference.upsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty("unsubscribedAt");
  });

  it("records where an opt-in came from", async () => {
    const prisma = makePrisma();
    const service = new EmailPreferenceService(prisma as never);

    await service.update("u1", { marketing: true }, "registration");

    expect(prisma.emailPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ subscriptionSource: "registration" }) }),
    );
  });
});
