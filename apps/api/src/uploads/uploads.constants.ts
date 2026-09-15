export const MAX_UPLOAD_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
export const MAX_UPLOAD_MEDIA_SIZE_BYTES = 60 * 1024 * 1024; // 60MB
/**
 * Chat attachments. Lower than the media ceiling on purpose: a chat file is sent from a phone on
 * a Turkmen mobile connection and has to arrive while somebody waits for it, which a 60MB video
 * does not. It is also the number quoted in the UI, so changing it means changing that copy too.
 */
export const MAX_UPLOAD_ATTACHMENT_SIZE_BYTES = 30 * 1024 * 1024; // 30MB

export const ALLOWED_UPLOAD_IMAGE_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const ALLOWED_UPLOAD_VIDEO_MIME_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const ALLOWED_UPLOAD_MEDIA_MIME_TYPES: Record<string, string> = {
  ...ALLOWED_UPLOAD_IMAGE_MIME_TYPES,
  ...ALLOWED_UPLOAD_VIDEO_MIME_TYPES,
};

/**
 * Documents a buyer or seller actually sends in a conversation: a receipt, a spec, a scan of a
 * delivery note. Deliberately a fixed list rather than "anything not executable" -- the file is
 * served back to other people, so the answer to "what can somebody hand another user" should be
 * enumerable, not defined by what we remembered to exclude.
 */
export const ALLOWED_UPLOAD_DOCUMENT_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
};

export const ALLOWED_UPLOAD_ATTACHMENT_MIME_TYPES: Record<string, string> = {
  ...ALLOWED_UPLOAD_MEDIA_MIME_TYPES,
  ...ALLOWED_UPLOAD_DOCUMENT_MIME_TYPES,
};
