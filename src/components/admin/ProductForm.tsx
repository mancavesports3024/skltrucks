"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { CAB_TYPES, MANUFACTURERS } from "@/lib/constants";
import { mergeDecodedDetails, shouldApplyField, type VinDecodeMode } from "@/lib/vin/apply";
import { buildVinDecodeMeta, type DecodedVin } from "@/lib/vin/decode";
import { uploadProductImages, validateImageFiles } from "@/lib/supabase/upload";
import type { Product } from "@/types/product";

const inputClass =
  "w-full min-h-11 border border-neutral-300 px-4 py-2.5 text-base sm:text-sm focus:border-[#fc0527] focus:outline-none focus:ring-1 focus:ring-[#fc0527]";
const labelClass = "block text-sm font-semibold mb-1";
const buttonClass =
  "min-h-11 shrink-0 border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold uppercase hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60";

type VinDecodeResponse = DecodedVin & {
  vin: string;
  error?: string;
};

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
  const [vin, setVin] = useState(product?.vin ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [year, setYear] = useState(product?.year ?? "");
  const [manufacturer, setManufacturer] = useState(product?.manufacturer?.toLowerCase() ?? "");
  const [model, setModel] = useState(product?.model ?? "");
  const [vinDecodeMode, setVinDecodeMode] = useState<VinDecodeMode>("fill-empty");
  const [vinDecodeStatus, setVinDecodeStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [vinDecodeMessage, setVinDecodeMessage] = useState("");
  const [vinDecodeWarnings, setVinDecodeWarnings] = useState<string[]>([]);
  const [lastSuggestedTitle, setLastSuggestedTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(formData: FormData) {
    setError("");
    setSaving(true);
    setUploadProgress("");

    try {
      const selected = fileInputRef.current?.files
        ? Array.from(fileInputRef.current.files)
        : [];

      const validationError = validateImageFiles(selected);
      if (validationError) {
        setError(validationError);
        return;
      }

      let uploadedUrls: string[] = [];
      if (selected.length > 0) {
        setUploadProgress(`Uploading ${selected.length} photo(s)…`);
        const upload = await uploadProductImages(selected);
        if (upload.error) {
          setError(upload.error);
          return;
        }
        uploadedUrls = upload.urls;
        setUploadProgress("Saving truck…");
      }

      // Don't send raw files through the server action (Vercel ~4.5MB limit).
      formData.delete("images");
      formData.set("existingImages", [...imageUrls, ...uploadedUrls].join("\n"));
      formData.set("details", JSON.stringify(details));
      formData.set("name", name);
      formData.set("vin", vin);
      formData.set("year", year);
      formData.set("manufacturer", manufacturer);
      formData.set("model", model);

      const result = await action(formData);
      if (result?.error) setError(result.error);
    } catch (err) {
      // Next.js redirect() throws; rethrow so navigation still works.
      if (
        err &&
        typeof err === "object" &&
        "digest" in err &&
        typeof (err as { digest?: string }).digest === "string" &&
        (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        throw err;
      }
      const message = err instanceof Error ? err.message : "Something went wrong while saving.";
      setError(
        message.includes("Failed to fetch") || message.includes("fetch")
          ? "Save timed out or lost connection. Try fewer/smaller photos, then save again."
          : message
      );
    } finally {
      setSaving(false);
      setUploadProgress("");
    }
  }

  function applyDecodedFields(decoded: VinDecodeResponse) {
    setVin(decoded.vin);

    if (shouldApplyField(year, decoded.year, vinDecodeMode) && decoded.year) {
      setYear(decoded.year);
    }
    if (shouldApplyField(model, decoded.model, vinDecodeMode) && decoded.model) {
      setModel(decoded.model);
    }
    if (shouldApplyField(manufacturer, decoded.manufacturer, vinDecodeMode) && decoded.manufacturer) {
      setManufacturer(decoded.manufacturer);
    }
    if (shouldApplyField(name, decoded.suggestedTitle, vinDecodeMode) && decoded.suggestedTitle) {
      setName(decoded.suggestedTitle);
    }

    setLastSuggestedTitle(decoded.suggestedTitle);
    setDetails((current) => {
      const merged = mergeDecodedDetails(current, decoded.details, vinDecodeMode);
      merged._vinDecode = buildVinDecodeMeta(decoded.vin, decoded.raw);
      return merged;
    });
  }

  async function handleDecodeVin() {
    setVinDecodeStatus("loading");
    setVinDecodeMessage("");
    setVinDecodeWarnings([]);

    const params = new URLSearchParams({ vin });
    if (year.trim()) params.set("year", year.trim());

    try {
      const res = await fetch(`/api/vin-decode?${params}`);
      const data = (await res.json()) as VinDecodeResponse;

      if (!res.ok) {
        setVinDecodeStatus("error");
        setVinDecodeMessage(data.error ?? "VIN lookup failed. Try again or enter details manually.");
        return;
      }

      applyDecodedFields(data);
      setVinDecodeWarnings(data.warnings ?? []);
      setVinDecodeStatus("success");

      const summary = [data.year, data.manufacturerLabel || data.make, data.model].filter(Boolean).join(" ");
      const filled =
        data.filledFields?.length > 0 ? ` Filled: ${data.filledFields.join(", ")}.` : "";
      setVinDecodeMessage(summary ? `Found: ${summary}.${filled}` : `VIN lookup complete.${filled}`);
    } catch {
      setVinDecodeStatus("error");
      setVinDecodeMessage("Could not reach the VIN lookup service. Check your connection and try again.");
    }
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
            <label className={labelClass}>VIN {isCopy && "*"}</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                name="vin"
                value={vin}
                onChange={(e) => {
                  setVin(e.target.value.toUpperCase());
                  if (vinDecodeStatus !== "idle") {
                    setVinDecodeStatus("idle");
                    setVinDecodeMessage("");
                    setVinDecodeWarnings([]);
                  }
                }}
                required={isCopy}
                placeholder="17-character VIN"
                maxLength={17}
                className={inputClass}
              />
              <button
                type="button"
                onClick={handleDecodeVin}
                disabled={vinDecodeStatus === "loading" || !vin.trim()}
                className={buttonClass}
              >
                {vinDecodeStatus === "loading" ? "Looking up..." : "VIN Lookup"}
              </button>
            </div>
            {vinDecodeStatus === "success" && vinDecodeMessage && (
              <p className="mt-2 text-sm text-green-700">{vinDecodeMessage}</p>
            )}
            {vinDecodeStatus === "error" && vinDecodeMessage && (
              <p className="mt-2 text-sm text-red-600">{vinDecodeMessage}</p>
            )}
            {vinDecodeWarnings.map((warning) => (
              <p key={warning} className="mt-2 text-sm text-amber-700">
                {warning}
              </p>
            ))}
            <fieldset className="mt-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                When applying lookup results
              </legend>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="vinDecodeMode"
                    value="fill-empty"
                    checked={vinDecodeMode === "fill-empty"}
                    onChange={() => setVinDecodeMode("fill-empty")}
                  />
                  Only fill empty fields
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="vinDecodeMode"
                    value="replace-all"
                    checked={vinDecodeMode === "replace-all"}
                    onChange={() => setVinDecodeMode("replace-all")}
                  />
                  Overwrite matched fields
                </label>
              </div>
            </fieldset>
            <p className="mt-2 text-xs text-neutral-500">
              Enter the VIN and click VIN Lookup to auto-fill year, manufacturer, model, and specs from
              NHTSA. Review everything before saving.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Listing Title *</label>
            <input
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="2021 International RH613 Day Cab – 6 month warranty..."
              className={inputClass}
            />
            {lastSuggestedTitle && lastSuggestedTitle !== name && (
              <button
                type="button"
                onClick={() => setName(lastSuggestedTitle)}
                className="mt-2 text-sm font-medium text-[#fc0527] hover:underline"
              >
                Use suggested title: {lastSuggestedTitle}
              </button>
            )}
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
            <input name="year" value={year} onChange={(e) => setYear(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Manufacturer</label>
            <select
              name="manufacturer"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              className={inputClass}
            >
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
            <input name="model" value={model} onChange={(e) => setModel(e.target.value)} className={inputClass} />
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
            <label className={labelClass}>Cab Type</label>
            <select name="cabType" defaultValue={product?.cabType || product?.type} className={inputClass}>
              <option value="">Select...</option>
              {CAB_TYPES.map((c) => (
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
          ref={fileInputRef}
          name="images"
          type="file"
          accept="image/*"
          multiple
          className="block w-full text-sm"
        />
        <p className="mt-1 text-xs text-neutral-500">
          You can select multiple images (max 25, 8 MB each). First image is the main photo.
          Tip: if save fails, try fewer photos or smaller file sizes.
        </p>
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

      {uploadProgress && <p className="text-sm text-neutral-600">{uploadProgress}</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <button
          type="submit"
          disabled={saving}
          className="min-h-12 w-full bg-[#fc0527] px-8 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {saving
            ? uploadProgress || "Saving…"
            : isCopy
              ? "Add Truck"
              : product
                ? "Save Changes"
                : "Add Truck"}
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
