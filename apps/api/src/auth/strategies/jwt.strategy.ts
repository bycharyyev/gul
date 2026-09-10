import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service";
import { ACCESS_TOKEN_SECRET } from "../jwt-secret";

export interface JwtPayload {
  sub: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: ACCESS_TOKEN_SECRET,
    });
  }

  // Re-checks isBlocked/role on every request instead of trusting the token's payload for the
  // full access-token TTL -- otherwise blocking a user or demoting an admin doesn't actually take
  // effect until their existing access token expires on its own.
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, isBlocked: true },
    });
    if (!user || user.isBlocked) throw new UnauthorizedException("Account blocked");
    return { userId: user.id, role: user.role };
  }
}
