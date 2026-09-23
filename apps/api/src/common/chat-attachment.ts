import { BadRequestException } from "@nestjs/common";
import {
  ALLOWED_UPLOAD_ATTACHMENT_MIME_TYPES,
  MAX_UPLOAD_ATTACHMENT_SIZE_BYTES,
} from "../uploads/uploads.constants";

export interface ChatAttachmentInput {
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ChatAttachmentColumns {
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
}

const EMPTY: ChatAttachmentColumns = {
  attachmentUrl: null,
  attachmentName: null,
  attachmentMime: null,
  attachmentSize: null,
};

/**
 * Checks an attachment a client claims to have uploaded, before it is stored next to a message.
 *
 * The upload endpoint already enforced type and size, but those values come back as plain JSON
 * fields on a second, separate request, so none of them is trustworthy until re-checked here.
 * The URL matters most: without this, a message could carry any address on the internet and
 * every reader's client would fetch it.
 *
 * `publicBase` is asked of StorageService rather than derived from S3_PUBLIC_BASE_URL -- that
 * variable is optional, and with it unset (which is how production runs) storage serves from the
 * bucket's virtual-hosted URL. Re-deriving it from the env once made an identical check reject
 * every real upload; see SocialFeedService.trustedMedia for that incident.
 */
export function validateAttachment(
  attachment: ChatAttachmentInput | null | undefined,
  publicBase: string | null,
): ChatAttachmentColumns {
  if (!attachment) return { ...EMPTY };

  const url = String(attachment.url ?? "").trim();
  const trusted = url.startsWith("/api/uploads/") || (!!publicBase && url.startsWith(`${publicBase}/uploads/`));
  if (!trusted) throw new BadRequestException("CHAT_ATTACHMENT_INVALID");

  if (!ALLOWED_UPLOAD_ATTACHMENT_MIME_TYPES[attachment.mimeType]) {
    throw new BadRequestException("CHAT_ATTACHMENT_TYPE");
  }

  const size = Number(attachment.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_ATTACHMENT_SIZE_BYTES) {
    throw new BadRequestException("CHAT_ATTACHMENT_TOO_LARGE");
  }

  return {
    attachmentUrl: url,
    attachmentName: String(attachment.name ?? "").trim().slice(0, 120) || "file",
    attachmentMime: attachment.mimeType,
    attachmentSize: Math.round(size),
  };
}
