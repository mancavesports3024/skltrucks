"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildCategoryFields,
  inputToRow,
  slugify,
} from "@/lib/db/products";
import { parseSiteContentForm } from "@/lib/site-content";
import { getProductById } from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";
import type { ProductInput } from "@/types/product";

export async function signIn(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

export async function getAdminEmail(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

export async function updatePassword(formData: FormData) {
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "All fields are required." };
  }

  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }

  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match." };
  }

  if (currentPassword === newPassword) {
    return { error: "New password must be different from your current password." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "You must be signed in to change your password." };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verifyError) {
    return { error: "Current password is incorrect." };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

function parseProductForm(formData: FormData): ProductInput {
  const cabType = formData.get("cabType") as string;
  const manufacturer = formData.get("manufacturer") as string;
  const { categories, categorySlugs } = buildCategoryFields(cabType, manufacturer);

  const existingImages = formData.get("existingImages") as string;
  const images = existingImages ? existingImages.split("\n").filter(Boolean) : [];
  const image = images[0] || "";

  const detailsRaw = formData.get("details") as string;
  let details: Record<string, string> = {};
  try {
    details = detailsRaw ? JSON.parse(detailsRaw) : {};
  } catch {
    details = {};
  }

  return {
    name: formData.get("name") as string,
    price: Number(formData.get("price")) || 0,
    image,
    images,
    categories,
    categorySlugs,
    cabType,
    type: cabType,
    manufacturer,
    vin: (formData.get("vin") as string) || "",
    year: (formData.get("year") as string) || "",
    model: (formData.get("model") as string) || "",
    miles: (formData.get("miles") as string) || "",
    hours: (formData.get("hours") as string) || "",
    condition: (formData.get("condition") as string) || "",
    details,
    published: formData.get("published") === "on",
  };
}

export async function uploadImages(formData: FormData): Promise<string[]> {
  const supabase = await createClient();
  const files = formData.getAll("images") as File[];
  const urls: string[] = [];

  for (const file of files) {
    if (!file || typeof file === "string" || file.size === 0) continue;
    if (typeof File !== "undefined" && !(file instanceof File)) continue;

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from("product-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) {
      console.error("Upload error:", error.message);
      throw new Error(`Photo upload failed: ${error.message}`);
    }

    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}

export async function createProduct(formData: FormData) {
  const supabase = await createClient();
  const input = parseProductForm(formData);

  const uploaded = await uploadImages(formData);
  input.images = [...input.images, ...uploaded];
  input.image = input.images[0] || "";

  const baseSlug = slugify(`${input.year}-${input.manufacturer}-${input.model}-${input.vin}`);
  const slug = baseSlug || slugify(input.name);

  const { error } = await supabase.from("products").insert(inputToRow(input, slug));

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/truck-sales");
  redirect("/admin");
}

export async function updateProduct(id: string, formData: FormData) {
  const supabase = await createClient();
  const input = parseProductForm(formData);

  const uploaded = await uploadImages(formData);
  input.images = [...input.images, ...uploaded];
  input.image = input.images[0] || "";

  const slug = slugify(`${input.year}-${input.manufacturer}-${input.model}-${input.vin}`) || slugify(input.name);

  const { error } = await supabase
    .from("products")
    .update(inputToRow(input, slug))
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath(`/product/${slug}`);
  redirect("/admin");
}

export async function deleteProduct(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/shop");
  redirect("/admin");
}

export async function getAdminProduct(id: string) {
  return (await getProductById(id)) ?? null;
}

export async function uploadSiteImage(formData: FormData): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const file = formData.get("file") as File;

  if (!file || file.size === 0) {
    return { error: "No file selected" };
  }

  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return { error: "Invalid file type. Use JPEG, PNG, GIF, or WebP." };
  }

  if (file.size > 10 * 1024 * 1024) {
    return { error: "File too large. Maximum size is 10MB." };
  }

  const ext = file.name.split(".").pop() || "jpg";
  const path = `site/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from("site-images").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    return { error: error.message };
  }

  const { data } = supabase.storage.from("site-images").getPublicUrl(path);
  return { url: data.publicUrl };
}

export async function updateSiteContent(formData: FormData) {
  const supabase = await createClient();
  const content = parseSiteContentForm(formData);

  const { error } = await supabase.from("site_content").upsert({
    id: "main",
    content,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/contact-us");
  return { success: true };
}
