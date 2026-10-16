import { UploadCleanupService } from "./upload-cleanup.service";

const BASE = "https://cdn.example.com";
const KEY = "uploads/0b1f5c3e-7a2d-4e8f-9c1b-2d3e4f5a6b7c.png";
const OLD = `${BASE}/${KEY}`;
const NEW = `${BASE}/uploads/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d.png`;

function build(opts: { referenced?: boolean; publicBase?: string | null; countError?: boolean } = {}) {
  const counted = {
    count: opts.countError
      ? jest.fn().mockRejectedValue(new Error("db down"))
      : jest.fn().mockResolvedValue(opts.referenced ? 1 : 0),
  };
  // Every model the check reads has the same shape, so one stub answers all of them.
  const prisma = new Proxy({}, { get: () => counted });
  const storage = {
    publicBase: opts.publicBase === undefined ? BASE : opts.publicBase,
    deletePublic: jest.fn().mockResolvedValue(undefined),
  };
  const service = new UploadCleanupService(prisma as never, storage as never);
  return { service, storage, counted };
}

describe("UploadCleanupService.removeIfReplaced", () => {
  it("deletes the previous upload when it is orphaned", async () => {
    const { service, storage } = build();
    await service.removeIfReplaced(OLD, NEW);
    expect(storage.deletePublic).toHaveBeenCalledWith(KEY);
  });

  it("does nothing when the value did not change or was empty before", async () => {
    const { service, storage } = build();
    await service.removeIfReplaced(OLD, OLD);
    await service.removeIfReplaced(null, NEW);
    await service.removeIfReplaced(undefined, NEW);
    expect(storage.deletePublic).not.toHaveBeenCalled();
  });

  it("keeps the file while any record still references it", async () => {
    const { service, storage } = build({ referenced: true });
    await service.removeIfReplaced(OLD, NEW);
    expect(storage.deletePublic).not.toHaveBeenCalled();
  });

  it("never touches files that are not our own uploads", async () => {
    const { service, storage } = build();
    await service.removeIfReplaced(`${BASE}/avatars/0b1f5c3e-7a2d-4e8f-9c1b-2d3e4f5a6b7c.png`, NEW);
    await service.removeIfReplaced("https://elsewhere.example.org/uploads/0b1f5c3e-7a2d-4e8f-9c1b-2d3e4f5a6b7c.png", NEW);
    await service.removeIfReplaced("/api/uploads/0b1f5c3e-7a2d-4e8f-9c1b-2d3e4f5a6b7c.png", NEW);
    expect(storage.deletePublic).not.toHaveBeenCalled();
  });

  it("does nothing when no public bucket is configured", async () => {
    const { service, storage } = build({ publicBase: null });
    await service.removeIfReplaced(OLD, NEW);
    expect(storage.deletePublic).not.toHaveBeenCalled();
  });

  it("swallows a failed reference check so the save is not reported as failed", async () => {
    const { service, storage } = build({ countError: true });
    await expect(service.removeIfReplaced(OLD, NEW)).resolves.toBeUndefined();
    expect(storage.deletePublic).not.toHaveBeenCalled();
  });
});
