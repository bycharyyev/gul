import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MAX_DOCUMENT_SIZE_BYTES } from "./documents.constants";

const USER_ID = "user-1";

/** Stands in for real Passport JWT verification: requires *a* bearer header, attaches a fixed user. */
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (!req.headers.authorization) throw new UnauthorizedException();
    req.user = { userId: USER_ID };
    return true;
  }
}

describe("DocumentsController (HTTP)", () => {
  let app: INestApplication;
  const documentsService = {
    listMine: jest.fn().mockResolvedValue([]),
    upload: jest.fn().mockResolvedValue({ id: "doc-1" }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [{ provide: DocumentsService, useValue: documentsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new FakeAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated requests with 401", async () => {
    await request(app.getHttpServer()).get("/documents").expect(401);
    await request(app.getHttpServer()).post("/documents").expect(401);
    await request(app.getHttpServer()).get("/documents/some-id").expect(401);
    await request(app.getHttpServer()).delete("/documents/some-id").expect(401);
  });

  it("rejects a disallowed MIME type with a 4xx and never reaches the service", async () => {
    const res = await request(app.getHttpServer())
      .post("/documents")
      .set("Authorization", "Bearer test")
      .attach("file", Buffer.from("#!/bin/sh\necho hi"), { filename: "script.sh", contentType: "application/x-sh" });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(documentsService.upload).not.toHaveBeenCalled();
  });

  it("rejects an oversized upload with a clean 4xx (not a 500)", async () => {
    const oversized = Buffer.alloc(MAX_DOCUMENT_SIZE_BYTES + 1024, 1);
    const res = await request(app.getHttpServer())
      .post("/documents")
      .set("Authorization", "Bearer test")
      .attach("file", oversized, { filename: "big.pdf", contentType: "application/pdf" });

    // @nestjs/platform-express maps Multer's LIMIT_FILE_SIZE to 413 Payload Too Large.
    expect(res.status).toBe(413);
    expect(documentsService.upload).not.toHaveBeenCalled();
  }, 20000);

  it("accepts an allowed MIME type within the size limit and calls the service", async () => {
    const res = await request(app.getHttpServer())
      .post("/documents")
      .set("Authorization", "Bearer test")
      .attach("file", Buffer.from("%PDF-1.4 fake"), { filename: "report.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    expect(documentsService.upload).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ originalname: "report.pdf", mimetype: "application/pdf" }),
    );
  });
});
