import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;
  private publicBucket: string | null = null;
  private privateBucket: string | null = null;
  private publicBaseUrl: string | null = null;

  /**
   * Where public objects are served from, exactly as [uploadPublic] writes it into a URL.
   *
   * Exposed because other modules have to recognise our own uploads, and the only way to do that
   * correctly is to ask the thing that produced them. Re-deriving it from `S3_PUBLIC_BASE_URL`
   * elsewhere looked equivalent and was not: that variable is optional, and when it is unset this
   * service falls back to the bucket's virtual-hosted URL. A caller reading the bare variable then
   * decided every upload was untrusted -- which is what silently blocked publishing any photo or
   * video to the feed.
   */
  get publicBase(): string | null {
    return this.publicBaseUrl;
  }

  constructor(private config: ConfigService) {
    const endpoint = this.config.get<string>("S3_ENDPOINT");
    const accessKeyId = this.config.get<string>("S3_ACCESS_KEY_ID");
    const secretAccessKey = this.config.get<string>("S3_SECRET_ACCESS_KEY");
    this.publicBucket = this.config.get<string>("S3_PUBLIC_BUCKET") || null;
    this.privateBucket = this.config.get<string>("S3_PRIVATE_BUCKET") || null;

    if (endpoint && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        endpoint,
        region: "us-east-1",
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      });
      // Where clients FETCH public objects, which is deliberately separate from where we upload
      // them. Default is the bucket's own virtual-hosted URL (confirmed against reg.ru:
      // endpoint s3.regru.cloud -> object at <bucket>.s3.regru.cloud/<key>), but setting
      // S3_PUBLIC_BASE_URL points reads at a CDN instead without touching the write path. That
      // matters here: the bucket is in a Russia region serving a Turkmenistan audience, and
      // putting a CDN in front later must not be a code change.
      const configuredBase = this.config.get<string>("S3_PUBLIC_BASE_URL");
      if (configuredBase) {
        this.publicBaseUrl = configuredBase.replace(/\/+$/, "");
      } else if (this.publicBucket) {
        const u = new URL(endpoint);
        this.publicBaseUrl = `${u.protocol}//${this.publicBucket}.${u.host}`;
      }
    } else if (process.env.NODE_ENV === "production") {
      // Loud, because the failure is otherwise invisible: uploads would silently land on the
      // local disk of whichever host served the request, and with two hosts serving
      // active/active the files end up scattered across both and unreadable from the other.
      this.logger.error("S3_STORAGE_UNCONFIGURED — S3_* env vars missing in production; uploads will be refused");
    } else {
      this.logger.warn("S3_* env vars not set — file storage falls back to local disk");
    }
  }

  /**
   * Where writes go, as one value rather than a pair of booleans a caller could read
   * independently and get wrong:
   *
   * - `s3`          — configured, the normal case
   * - `local`       — no credentials, development only; writes go to UPLOADS_DIR
   * - `unavailable` — no credentials in production. Callers must refuse the upload: silently
   *   writing to disk would scatter user files across the two active/active hosts, invisible
   *   until a document 404s from the other one.
   */
  get mode(): "s3" | "local" | "unavailable" {
    if (this.client) return "s3";
    return process.env.NODE_ENV === "production" ? "unavailable" : "local";
  }

  /** True when objects go to S3. Kept as the readable form of `mode === "s3"`. */
  get enabled(): boolean {
    return this.mode === "s3";
  }

  async uploadPublic(key: string, body: Buffer, contentType: string): Promise<string> {
    if (!this.client || !this.publicBucket || !this.publicBaseUrl) {
      throw new Error("S3 public storage is not configured");
    }
    await this.client.send(
      new PutObjectCommand({ Bucket: this.publicBucket, Key: key, Body: body, ContentType: contentType }),
    );
    return `${this.publicBaseUrl}/${key}`;
  }

  async uploadPrivate(key: string, body: Buffer, contentType: string): Promise<void> {
    if (!this.client || !this.privateBucket) {
      throw new Error("S3 private storage is not configured");
    }
    await this.client.send(
      new PutObjectCommand({ Bucket: this.privateBucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async deletePublic(key: string): Promise<void> {
    if (!this.client || !this.publicBucket) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.publicBucket, Key: key })).catch(() => {});
  }

  async deletePrivate(key: string): Promise<void> {
    if (!this.client || !this.privateBucket) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.privateBucket, Key: key })).catch(() => {});
  }

  /** Short-lived (default 60s) signed GET -- the private bucket has no public policy, so this
   *  is the only way to hand a client a URL for it. Caller must still check ownership first. */
  async presignPrivateGet(key: string, ttlSeconds = 60): Promise<string> {
    if (!this.client || !this.privateBucket) {
      throw new Error("S3 private storage is not configured");
    }
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.privateBucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }

  /** Strips this instance's public base URL off a stored avatarPath, if present, to recover
   *  the object key for deletion. Returns null for a legacy local-disk filename. */
  publicKeyFromUrl(value: string): string | null {
    if (!this.publicBaseUrl || !value.startsWith(`${this.publicBaseUrl}/`)) return null;
    return value.slice(this.publicBaseUrl.length + 1);
  }
}
