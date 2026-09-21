import { Injectable, Logger } from "@nestjs/common";
import { FirebasePushGateway } from "./firebase-push.gateway";

const CACHE_MS = 60_000;

/**
 * The minimum mobile app version, read from the same Remote Config parameter the app reads
 * (`min_app_version`), so the team changes it in one place.
 *
 * Fails open on purpose: if Firebase is unreachable or not configured, nobody is locked out. The
 * last successfully read value keeps being used, so a short Firebase outage does not lift a block
 * that was already in force.
 */
@Injectable()
export class AppVersionPolicyService {
  private readonly logger = new Logger(AppVersionPolicyService.name);
  private cached = "";
  private fetchedAt = 0;
  private pending?: Promise<string>;

  constructor(private readonly firebase: FirebasePushGateway) {}

  async minimumVersion(): Promise<string> {
    if (!this.firebase.enabled) return "";
    if (Date.now() - this.fetchedAt < CACHE_MS) return this.cached;
    this.pending ??= this.refresh().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async refresh(): Promise<string> {
    try {
      this.cached = (await this.firebase.remoteConfigValue("min_app_version")).trim();
    } catch (err) {
      this.logger.warn(`Could not read min_app_version (${err instanceof Error ? err.constructor.name : "error"})`);
    }
    // Also after a failure: retry after the cache period, not on every request.
    this.fetchedAt = Date.now();
    return this.cached;
  }
}
