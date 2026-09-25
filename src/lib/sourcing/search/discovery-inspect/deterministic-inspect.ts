/**
 * Deterministic page inspection from HTML/JSON-LD (no provider call).
 * listingUrl is always bound to the final validated URL.
 */
import { extractTruckFromPageText, extractContactFromPageText } from "@/lib/sourcing/search/extract-from-text";
import type { ExtractedContactCandidate, ExtractedTruckCandidate } from "@/lib/sourcing/search/types";

function extractJsonLdBlobs(html: string): string[] {
  const out: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

function textFromJsonLd(blobs: string[]): string {
  const parts: string[] = [];
  for (const raw of blobs) {
    try {
      const parsed = JSON.parse(raw);
      const walk = (node: unknown) => {
        if (!node) return;
        if (typeof node === "string") {
          parts.push(node);
          return;
        }
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        if (typeof node === "object") {
          for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (typeof v === "string" && /name|description|sku|vehicle|mileage|price|vin/i.test(k)) {
              parts.push(`${k}: ${v}`);
            } else {
              walk(v);
            }
          }
        }
      };
      walk(parsed);
    } catch {
      /* ignore invalid JSON-LD */
    }
  }
  return parts.join("\n");
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inspectListingHtmlDeterministic(args: {
  finalUrl: string;
  html: string;
  title?: string;
}): {
  truck: ExtractedTruckCandidate;
  contact: ExtractedContactCandidate | null;
  requiredEvidenceMissing: boolean;
} {
  const jsonLdText = textFromJsonLd(extractJsonLdBlobs(args.html));
  const plain = stripTags(args.html).slice(0, 80_000);
  const content = [jsonLdText, plain].filter(Boolean).join("\n");
  const page = {
    url: args.finalUrl,
    title: args.title || "",
    content,
  };
  const truck = extractTruckFromPageText(page);
  // Bind listing URL to final validated URL — never invent/substitute.
  truck.listingUrl = args.finalUrl;
  truck.evidenceUrl = args.finalUrl;
  const contact = extractContactFromPageText(page);
  if (contact) {
    contact.sourceUrl = args.finalUrl;
  }

  const requiredEvidenceMissing =
    !truck.engineEvidence ||
    !truck.transmissionEvidence ||
    !truck.boxLengthEvidence ||
    (!truck.gvwrEvidence && truck.listedWeightTerm !== "gvw" && truck.manufacturerGvwrLbs == null);

  return { truck, contact, requiredEvidenceMissing };
}
