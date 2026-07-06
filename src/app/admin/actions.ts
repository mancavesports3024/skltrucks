"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildCategoryFields,
  inputToRow,
  rowToProduct,
  slugify,
} from "@/lib/db/products";
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

function parseProductForm(formData: FormData): ProductInput {
  const type = formData.get("type") as string;
  const manufacturer = formData.get("manufacturer") as string;
  const { categories, categorySlugs } = buildCategoryFields(type, manufacturer);

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
    type,
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
    if (!file || file.size === 0) continue;

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from("product-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) {
      console.error("Upload error:", error.message);
      continue;
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
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
  if (error || !data) return null;
  return rowToProduct(data);
}
