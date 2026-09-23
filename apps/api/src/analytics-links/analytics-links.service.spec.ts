import { NotFoundException } from "@nestjs/common";
import { AnalyticsLinksService } from "./analytics-links.service";

describe("AnalyticsLinksService", () => {
  const prisma = {
    analyticsLink: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };
  const service = new AnalyticsLinksService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it("derives and stores the favicon from the website origin", async () => {
    prisma.analyticsLink.create.mockImplementation(({ data }) =>
      Promise.resolve(data),
    );

    await service.create({
      title: "PageSpeed",
      description: "Mobile report",
      url: "https://pagespeed.web.dev/analysis/example?form_factor=mobile",
    });

    expect(prisma.analyticsLink.create).toHaveBeenCalledWith({
      data: {
        title: "PageSpeed",
        description: "Mobile report",
        url: "https://pagespeed.web.dev/analysis/example?form_factor=mobile",
        faviconUrl: "https://pagespeed.web.dev/favicon.ico",
      },
    });
  });

  it("does not delete a missing link", async () => {
    prisma.analyticsLink.findUnique.mockResolvedValue(null);
    await expect(service.remove("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.analyticsLink.delete).not.toHaveBeenCalled();
  });
});
