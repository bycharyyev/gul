import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { AppVersionPolicyService } from "../notifications/app-version-policy.service";
import { isVersionBelow } from "./app-version";

/**
 * Refuses requests from a mobile build older than the minimum set in Remote Config
 * (`min_app_version`), with 426 Upgrade Required.
 *
 * This is the enforcement behind the app's "update required" screen. The screen alone is not
 * enough for a security-driven update: a phone only learns the new minimum when it next fetches
 * its config, and a modified client could ignore it. Here every request from an old build is
 * refused, whatever the phone believes.
 *
 * Only requests that announce a version are judged (`X-App-Version`, sent by the mobile app), so
 * the website, the admin console, partners and shop keys are never affected. Runs as middleware,
 * before guards, so an old build sees the same answer whether or not it is signed in.
 */
@Injectable()
export class MinAppVersionMiddleware implements NestMiddleware {
  constructor(private readonly policy: AppVersionPolicyService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const version = req.header("x-app-version");
    if (!version || isHealthCheck(req.originalUrl ?? req.url ?? "")) {
      next();
      return;
    }
    const minimum = await this.policy.minimumVersion();
    if (minimum && isVersionBelow(version, minimum)) {
      res.status(426).json({
        statusCode: 426,
        code: "APP_UPDATE_REQUIRED",
        message: "This version of the app is no longer supported. Please update.",
        minVersion: minimum,
      });
      return;
    }
    next();
  }
}

function isHealthCheck(url: string): boolean {
  return url.startsWith("/api/health");
}
