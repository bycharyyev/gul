import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  App,
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getRemoteConfig } from "firebase-admin/remote-config";
import {
  BatchResponse,
  getMessaging,
  MulticastMessage,
} from "firebase-admin/messaging";

@Injectable()
export class FirebasePushGateway implements OnModuleInit {
  private readonly logger = new Logger(FirebasePushGateway.name);
  private app?: App;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const projectId = this.config.get<string>("FIREBASE_PROJECT_ID");
    if (!projectId) {
      this.logger.warn(
        "Push delivery disabled: FIREBASE_PROJECT_ID is not configured",
      );
      return;
    }

    // A malformed secret must not stop the API from booting: order and payment flows do not
    // depend on push. Log only that it failed, never the value or the parser's excerpt of it.
    try {
      const encoded = this.config.get<string>(
        "FIREBASE_SERVICE_ACCOUNT_BASE64",
      );
      const credential = encoded
        ? cert(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")))
        : applicationDefault();
      this.app = getApps()[0] ?? initializeApp({ credential, projectId });
    } catch {
      this.logger.error(
        "Push delivery disabled: Firebase credentials could not be loaded",
      );
    }
  }

  get enabled() {
    return Boolean(this.app);
  }

  /** A parameter's default value from the published Remote Config template ("" when unset). */
  async remoteConfigValue(key: string): Promise<string> {
    if (!this.app) throw new Error("Firebase is not configured");
    const template = await getRemoteConfig(this.app).getTemplate();
    const value = template.parameters?.[key]?.defaultValue;
    return value && "value" in value ? value.value : "";
  }

  async send(
    message: Omit<MulticastMessage, "tokens">,
    tokens: string[],
  ): Promise<BatchResponse> {
    if (!this.app) throw new Error("Firebase push delivery is not configured");
    return getMessaging(this.app).sendEachForMulticast({ ...message, tokens });
  }
}
