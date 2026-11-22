/** Validation for screenshot uploads: size, declared type AND magic bytes. Files are never written to disk. */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export function maxUploadBytes(): number {
  const mb = Number(process.env.VICE_INTEL_MAX_UPLOAD_MB ?? 8);
  return (Number.isFinite(mb) && mb > 0 ? mb : 8) * 1024 * 1024;
}

export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  const b = bytes;
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return "image/webp";
  return null;
}

export type UploadCheck =
  | { ok: true; type: AllowedImageType; bytes: Uint8Array }
  | { ok: false; status: number; code: "missing" | "too_large" | "unsupported_type"; message: string };

export async function validateImageUpload(file: File | null): Promise<UploadCheck> {
  if (!file || typeof file === "string") return { ok: false, status: 400, code: "missing", message: "No image was uploaded." };
  const max = maxUploadBytes();
  if (file.size > max)
    return { ok: false, status: 413, code: "too_large", message: `Image is larger than ${Math.round(max / 1024 / 1024)} MB.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  // Trust the file's bytes, not the declared MIME type.
  if (!sniffed) {
    return { ok: false, status: 415, code: "unsupported_type", message: "Use a JPEG, PNG, WebP or GIF image." };
  }
  return { ok: true, type: sniffed, bytes };
}
