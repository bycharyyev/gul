import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { VERSION_NEUTRAL, ValidationPipe, VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { configureBodyParsing } from "./common/body-parsing";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // The webhook route receives exact bytes for signature verification and has a deliberately
  // small bound. Other JSON endpoints retain the upload-compatible API limit; multipart uploads
  // are handled independently by Multer.
  configureBodyParsing(app);
  // Every request reaches this process through nginx on the loopback, so without this
  // `req.ip` is 127.0.0.1 for the entire internet. ThrottlerGuard tracks by `req.ip`, which
  // meant one shared bucket for every visitor on earth: 120 requests a minute for the whole
  // site, 10 logins a minute globally, 5 password resets. Measured against production on
  // 2026-09-03 -- 130 requests each claiming a different client address, 118 succeeded and
  // the rest were rejected, proving the addresses were never being told apart.
  //
  // `1` and not `true`: nginx sets X-Forwarded-For with $proxy_add_x_forwarded_for, which
  // appends the real peer to whatever the client sent. Trusting exactly one hop takes the
  // last entry -- the address nginx saw -- so a client cannot promote its own spoofed value
  // by prefilling the header. `true` would trust the leftmost and hand every visitor a
  // rate-limit identity of their own choosing.
  app.set("trust proxy", 1);
  // Without this, SIGTERM (sent by `docker compose up -d` when it recreates this container on
  // every deploy) kills the process immediately -- any request already in flight gets its
  // connection cut instead of finishing. This makes Nest stop accepting new connections and
  // let in-flight ones complete (and run onModuleDestroy hooks) before the process exits.
  app.enableShutdownHooks();

  // Baseline security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, etc.).
  // CSP is left to its default-off here: this API serves JSON to separate web/admin frontends,
  // not HTML it renders itself, so a content policy belongs on those apps, not here -- an API-wide
  // CSP would do nothing but risk breaking Swagger's `/docs` UI, which needs inline scripts/styles.
  app.use(helmet({ contentSecurityPolicy: false }));

  // credentials:true + a reflect-any-origin `true` would let any site make authenticated
  // requests on a logged-in user's behalf -- fail closed instead of open when unconfigured.
  const corsOrigins = (process.env.CORS_ORIGINS ?? "").split(",").filter(Boolean);
  app.enableCors({ origin: corsOrigins.length ? corsOrigins : false, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix("api");

  // Versioning, but only where a version means something.
  //
  // VERSION_NEUTRAL is the default on purpose: web and admin ship in the same deploy as this
  // process, so their routes cannot fall out of step and a version segment on them would be a
  // number nobody ever reads. The surfaces that DO need one are the two reached with an API key
  // — a partner or a shop writes a program against them, and that program is released on
  // somebody else's schedule. Those controllers opt in with @Version.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSION_NEUTRAL });

  const config = new DocumentBuilder()
    .setTitle("Topup Hub API")
    .setDescription("Marketplace + admin backend contract, consumed by web, admin and mobile clients")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}/api (docs at /docs)`);
}

bootstrap();
