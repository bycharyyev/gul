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
  placeholder?: string;
}

/** Text input for a direct URL (kept for pasting an already-hosted image) plus a real upload
 *  button backed by POST /uploads/image — used everywhere the app has a plain imageUrl/logoUrl
 *  field (catalog service logos, stories, home slides; gallery products and seller shop logo have
 *  their own copy in apps/web, duplicated rather than shared per this repo's existing convention
 *  for apps/admin vs apps/web UI). */
export function ImageUploadField({
  label,
  value,
  onChange,
  uploadLabel,
  hint,
  required,
  placeholder,
}: ImageUploadFieldProps) {
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
    <div className="grid grid-cols-[1fr_auto] gap-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? "https://…"}
            required={required}
          />
          <Button
            type="button"
            variant="secondary"
            size="md"
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
        </div>
        {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
        {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
      {value && (
        <img
          src={value}
          alt=""
          className="h-10 w-10 rounded-lg border border-slate-200 object-cover"
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
        />
      )}
    </div>
  );
}
