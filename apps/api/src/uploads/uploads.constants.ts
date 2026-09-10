export const MAX_UPLOAD_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
export const MAX_UPLOAD_MEDIA_SIZE_BYTES = 60 * 1024 * 1024; // 60MB

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
