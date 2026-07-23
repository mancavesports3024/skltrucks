"use client";

import { createClient } from "@/lib/supabase/client";

const COMPRESS_OVER_BYTES = 1.5 * 1024 * 1024;
const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 0.85;
const UPLOAD_CONCURRENCY = 4;
const MAX_RETRIES = 2;

export type UploadProgress = {
  current: number;
  total: number;
  fileName: string;
};

function isImageFile(file: File): boolean {
  return Boolean(file && file.size > 0 && (file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)));
}

/** Shrink large phone photos so many can upload reliably — no hard file limits. */
async function prepareImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  // Small enough already
  if (file.size <= COMPRESS_OVER_BYTES && !file.type.includes("heic") && !file.type.includes("heif")) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );

    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // HEIC or unsupported decode — upload original
    return file;
  }
}

async function uploadOne(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  file: File
): Promise<string> {
  const prepared = await prepareImageForUpload(file);
  const ext =
    (prepared.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  let lastError = "Upload failed";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase.storage.from("product-images").upload(path, prepared, {
      cacheControl: "3600",
      upsert: false,
      contentType: prepared.type || "image/jpeg",
    });

    if (!error) {
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      return data.publicUrl;
    }

    lastError = error.message;
    // Retry with a unique path if name collided
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }

  throw new Error(lastError);
}

/**
 * Upload any number of product photos to Supabase Storage.
 * No count/size caps — large phone photos are compressed automatically.
 */
export async function uploadProductImages(
  files: File[],
  onProgress?: (progress: UploadProgress) => void
): Promise<{ urls: string[]; error?: string; failed: string[] }> {
  const images = files.filter(isImageFile);
  if (images.length === 0) return { urls: [], failed: [] };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      urls: [],
      failed: [],
      error: "Your session expired. Please sign in again and try saving.",
    };
  }

  const urls: string[] = [];
  const failed: string[] = [];
  let completed = 0;

  for (let i = 0; i < images.length; i += UPLOAD_CONCURRENCY) {
    const batch = images.slice(i, i + UPLOAD_CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (file) => {
        onProgress?.({
          current: completed + 1,
          total: images.length,
          fileName: file.name,
        });
        const url = await uploadOne(supabase, user.id, file);
        completed += 1;
        onProgress?.({
          current: completed,
          total: images.length,
          fileName: file.name,
        });
        return url;
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const file = batch[j];
      if (result.status === "fulfilled") {
        urls.push(result.value);
      } else {
        failed.push(file.name);
        completed += 1;
      }
    }
  }

  if (urls.length === 0 && failed.length > 0) {
    return {
      urls: [],
      failed,
      error: `Could not upload any photos. First failure may be a connection or permissions issue.`,
    };
  }

  if (failed.length > 0) {
    return {
      urls,
      failed,
      error: `Uploaded ${urls.length} photo(s). ${failed.length} failed: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""}. You can try those again.`,
    };
  }

  return { urls, failed: [] };
}
