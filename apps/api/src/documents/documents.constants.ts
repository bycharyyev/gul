// Reasonable defaults — no existing quota elsewhere in this codebase to copy from.
export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20MB per file
export const MAX_DOCUMENTS_PER_USER = 50; // documents per user

// Usability guard only (extension/Content-Type filtering is trivially spoofable) —
// not a security boundary against malicious uploads.
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
