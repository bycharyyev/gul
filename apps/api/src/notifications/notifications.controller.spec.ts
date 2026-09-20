import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { NotificationsController } from "./notifications.controller";

describe("NotificationsController security", () => {
  it("requires JWT authentication for every notification endpoint", () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      NotificationsController,
    ) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
  });

  it("rate limits registration, removal and the test send", () => {
    const reflector = new Reflector();
    const limit = (handler: (...args: never[]) => unknown) =>
      reflector.get<number>("THROTTLER:LIMITdefault", handler);
    const proto = NotificationsController.prototype;
    expect(limit(proto.register)).toBe(20);
    expect(limit(proto.remove)).toBe(20);
    expect(limit(proto.opened)).toBe(120);
    expect(limit(proto.test)).toBe(3);
  });

  it("restricts test delivery to administrators", () => {
    const method = NotificationsController.prototype.test;
    expect(Reflect.getMetadata(ROLES_KEY, method)).toEqual(["ADMIN"]);
    const guards = Reflect.getMetadata(GUARDS_METADATA, method) as unknown[];
    expect(guards).toContain(RolesGuard);
  });
});
