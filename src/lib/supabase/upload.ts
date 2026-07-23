"use client";

import { createClient } from "@/lib/supabase/client";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB per photo
const MAX_FILES = 25;

export function validateImageFiles(files: File[]): string | null {
  const images = files.filter((f) => f && f.size > 0 && f.type.startsWith("image/"));
  if (images.length === 0) return null;

  if (images.length > MAX_FILES) {
    return `Please upload at most ${MAX_FILES} photos at a time.`;
  }

  const tooLarge = images.find((f) => f.size > MAX_FILE_BYTES);
  if (tooLarge) {
    return `"${tooLarge.name}" is too large (${(tooLarge.size / 1024 / 1024).toFixed(1)} MB). Max is 8 MB per photo — try a smaller photo or reduce quality.`;
  }

  return null;
}

export async function uploadProductImages(files: File[]): Promise<{ urls: string[]; error?: string }> {
  const images = files.filter((f) => f && f.size > 0 && f.type.startsWith("image/"));
  if (images.length === 0) return { urls: [] };

  const validationError = validateImageFiles(images);
  if (validationError) return { urls: [], error: validationError };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { urls: [], error: "Your session expired. Please sign in again and try saving." };
  }

  const urls: string[] = [];

  for (const file of images) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from("product-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

    if (error) {
      return {
        urls,
        error: `Photo upload failed: ${error.message}. ${urls.length} photo(s) uploaded before the error.`,
      };
    }

    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return { urls };
}
