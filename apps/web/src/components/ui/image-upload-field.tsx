"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "./button";
import { Input } from "./input";

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  uploadLabel: string;
  hint?: string;
  required?: boolean;
}

/** Text input for a direct URL (kept for pasting an already-hosted image) plus a real upload
 *  button backed by POST /uploads/image. Duplicated from apps/admin's copy rather than shared,
 *  per this repo's existing convention for apps/admin vs apps/web UI primitives. */
export function ImageUploadField({ label, value, onChange, uploadLabel, hint, required }: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <div className="flex items-center gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" required={required} />
        <Button
          type="button"
          variant="secondary"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? "…" : uploadLabel}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileSelect}
        />
        {value && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary external/S3 URL, not a static asset
          <img
            src={value}
            alt=""
            className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover"
            onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          />
        )}
      </div>
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
