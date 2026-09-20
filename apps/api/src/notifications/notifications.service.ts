import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PushPlatform } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FirebasePushGateway } from "./firebase-push.gateway";

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

// FCM accepts at most 500 tokens per multicast request.
const FCM_BATCH_SIZE = 500;
// A person with more than a handful of live installs is either reinstalling constantly or
// abusing the endpoint; the oldest registrations are the ones FCM has most likely already retired.
const MAX_DEVICES_PER_USER = 10;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebasePushGateway,
  ) {}

  async register(userId: string, token: string, platform: PushPlatform) {
    const device = await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date() },
      select: { id: true, platform: true, createdAt: true, lastSeenAt: true },
    });
    await this.trimOldDevices(userId);
    return device;
  }

  private async trimOldDevices(userId: string) {
    const stale = await this.prisma.pushToken.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
      skip: MAX_DEVICES_PER_USER,
      select: { id: true },
    });
    if (stale.length === 0) return;
    await this.prisma.pushToken.deleteMany({
      where: { id: { in: stale.map((device) => device.id) } },
    });
  }

  async remove(userId: string, token: string) {
    const result = await this.prisma.pushToken.deleteMany({
      where: { userId, token },
    });
    return { removed: result.count > 0 };
  }

  async sendToUser(
    userId: string,
    notification: { title: string; body: string },
    data: Record<string, string> = {},
  ) {
    if (!this.firebase.enabled) {
      throw new ServiceUnavailableException(
        "Firebase push delivery is not configured",
      );
    }
    const devices = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (devices.length === 0) return { requested: 0, delivered: 0, failed: 0 };
    if (Object.values(data).some((value) => typeof value !== "string")) {
      // FCM rejects the whole message when a data value is not a string.
      throw new BadRequestException("Push data values must be strings");
    }

    const message = {
      notification,
      data,
      android: {
        priority: "high" as const,
        notification: { channelId: "gulyaly_general" },
      },
      apns: {
        payload: { aps: { sound: "default", contentAvailable: true } },
      },
    };

    let delivered = 0;
    let failed = 0;
    const invalid: string[] = [];
    for (let start = 0; start < devices.length; start += FCM_BATCH_SIZE) {
      const batch = devices.slice(start, start + FCM_BATCH_SIZE);
      const response = await this.firebase.send(
        message,
        batch.map((device) => device.token),
      );
      delivered += response.successCount;
      failed += response.failureCount;
      response.responses.forEach((item, index) => {
        const code = item.error?.code;
        const device = batch[index];
        if (device && code && INVALID_TOKEN_CODES.has(code)) {
          invalid.push(device.token);
        }
      });
    }

    if (invalid.length) {
      await this.prisma.pushToken.deleteMany({
        where: { token: { in: invalid } },
      });
      this.logger.log(`Removed ${invalid.length} invalid push token(s)`);
    }
    return { requested: devices.length, delivered, failed };
  }
}
