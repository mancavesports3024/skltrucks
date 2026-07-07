"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { INVENTORY_CATEGORIES, MANUFACTURERS } from "@/lib/constants";
import type { Product } from "@/types/product";

const inputClass =
  "w-full min-h-11 border border-neutral-300 px-4 py-2.5 text-base sm:text-sm focus:border-[#fc0527] focus:outline-none focus:ring-1 focus:ring-[#fc0527]";
const labelClass = "block text-sm font-semibold mb-1";

const DETAIL_FIELDS = [
  "Engine Model",
  "Engine HP",
  "Trans Make",
  "Trans Model",
  "Trans Speed",
  "Trans Type",
  "Front Tire Size",
  "Rear Tire Size",
  "Axle Configuration",
  "FA Capacity",
  "RA Capacity",
  "Rear End Ratio",
  "Wheelbase",
  "GVWR",
  "Wheels",
  "Box Length",
  "Box Width",
  "Box Height",
  "Lift Gate",
  "Door Opening",
  "Roof",
  "Floor Material",
  "Color",
  "Fuel Type",
  "Brakes",
  "Under CDL",
  "Class",
  "Suspension",
  "Warranty",
];

interface ProductFormProps {
  product?: Product;
  isCopy?: boolean;
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}

export default function ProductForm({ product, isCopy = false, action }: ProductFormProps) {
  const [error, setError] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>(product?.images ?? []);
  const [details, setDetails] = useState<Record<string, string>>(product?.details ?? {});

  async function handleSubmit(formData: FormData) {
    formData.set("existingImages", imageUrls.join("\n"));
    formData.set("details", JSON.stringify(details));
    const result = await action(formData);
    if (result?.error) setError(result.error);
  }

  function removeImage(url: string) {
    setImageUrls((prev) => prev.filter((u) => u !== url));
  }

  return (
    <form action={handleSubmit} className="space-y-8">
      {isCopy && (
        <div className="border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          This listing was copied from an existing truck. Update the <strong>VIN</strong> and any
          other details, then save as a new truck.
        </div>
      )}
      <section className="bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-bold">Basic Information</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelClass}>Listing Title *</label>
            <input
              name="name"
              required
              defaultValue={product?.name}
              placeholder="2021 International RH613 Day Cab – 6 month warranty..."
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Price ($) *</label>
            <input
              name="price"
              type="number"
              required
              min={0}
              step={50}
              defaultValue={product?.price}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Year</label>
            <input name="year" defaultValue={product?.year} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Manufacturer</label>
            <select name="manufacturer" defaultValue={product?.manufacturer?.toLowerCase()} className={inputClass}>
              <option value="">Select...</option>
              {MANUFACTURERS.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Model</label>
            <input name="model" defaultValue={product?.model} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>VIN {isCopy && "*"}</label>
            <input
              name="vin"
              defaultValue={product?.vin}
              required={isCopy}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Miles</label>
            <input name="miles" defaultValue={product?.miles} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Hours</label>
            <input name="hours" defaultValue={product?.hours} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Condition</label>
            <select name="condition" defaultValue={product?.condition || "Used"} className={inputClass}>
              <option value="Used">Used</option>
              <option value="New">New</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <select name="type" defaultValue={product?.type} className={inputClass}>
              <option value="">Select...</option>
              {INVENTORY_CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              name="published"
              id="published"
              defaultChecked={product?.published !== false}
              className="h-4 w-4"
            />
            <label htmlFor="published" className="text-sm font-semibold">
              Published (visible on website)
            </label>
          </div>
        </div>
      </section>

      <section className="bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-bold">Photos</h2>
        {imageUrls.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {imageUrls.map((url) => (
              <div key={url} className="relative aspect-square bg-neutral-100">
                <Image src={url} alt="" fill className="object-cover" sizes="150px" />
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  className="absolute right-1 top-1 bg-red-600 px-2 py-0.5 text-xs text-white"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <label className={labelClass}>Upload New Photos</label>
        <input
          name="images"
          type="file"
          accept="image/*"
          multiple
          className="block w-full text-sm"
        />
        <p className="mt-1 text-xs text-neutral-500">You can select multiple images. First image is the main photo.</p>
      </section>

      <section className="bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-bold">Detailed Specifications</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {DETAIL_FIELDS.map((field) => (
            <div key={field}>
              <label className="text-xs font-medium text-neutral-600">{field}</label>
              <input
                value={details[field] ?? ""}
                onChange={(e) => setDetails((d) => ({ ...d, [field]: e.target.value }))}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <button
          type="submit"
          className="min-h-12 w-full bg-[#fc0527] px-8 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] sm:w-auto"
        >
          {isCopy ? "Add Truck" : product ? "Save Changes" : "Add Truck"}
        </button>
        <Link
          href="/admin"
          className="flex min-h-12 w-full items-center justify-center border border-neutral-300 px-8 py-3 text-sm font-semibold uppercase hover:bg-neutral-50 sm:w-auto"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
