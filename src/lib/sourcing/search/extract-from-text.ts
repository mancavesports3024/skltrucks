/**
 * Conservative extraction from published page/snippet text.
 * Never invents values — only sets a field when a clear phrase is present,
 * and always keeps a supporting quote + evidence URL.
 */
import type { ListedWeightTerm } from "@/types/sourcing";
import type { ExtractedContactCandidate, ExtractedTruckCandidate } from "@/lib/sourcing/search/types";
import { isRejectedStockToken } from "@/lib/sourcing/search/discovery-inspect/listing-identity";

export interface PageSnippet {
  url: string;
  title?: string;
  content: string;
  sourceName?: string;
}

function quoteAround(text: string, index: number, len = 80): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + len);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function findPhone(text: string): { phone: string; quote: string } | null {
  // Require separators or parentheses so bare Facebook/post IDs are not treated as phones.
  const re = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
  const m = re.exec(text);
  if (!m) return null;
  return { phone: m[0].trim(), quote: quoteAround(text, m.index) };
}

function findVin(text: string): { vin: string; quote: string } | null {
  const re = /\b([A-HJ-NPR-Z0-9]{17})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const vin = m[1].toUpperCase();
    // Skip obvious non-VIN all-digit runs
    if (/^\d+$/.test(vin)) continue;
    return { vin, quote: quoteAround(text, m.index) };
  }
  return null;
}

function findYear(text: string): { year: number; quote: string } | null {
  const re = /\b(20[1-2]\d)\b/;
  const m = text.match(re);
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 2010 || year > 2030) return null;
  return { year, quote: quoteAround(text, m.index ?? 0) };
}

function findMakeModel(title: string, text: string): string {
  const blob = `${title} ${text}`.slice(0, 400);
  const m = blob.match(
    /\b(Freightliner|International|Hino|Isuzu|Kenworth|Peterbilt|Ford|Chevrolet|GMC|Ram)\b[^.,;\n]{0,60}/i
  );
  return m ? m[0].replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

function findStock(text: string): string {
  // Prefer "Stock Number VDXK3543" / "Stock # 18534" over capturing label words.
  const labeled = text.match(
    /\b(?:stock|stk)\s*(?:number|no\.?|num|#)?\s*[#:.]?\s*([A-Z0-9-]{3,20})\b/i
  );
  if (labeled && !isRejectedStockToken(labeled[1])) {
    return labeled[1];
  }
  const hash = text.match(/#\s*([A-Z0-9-]{3,20})\b/i);
  if (hash && !isRejectedStockToken(hash[1])) {
    return hash[1];
  }
  return "";
}

function findEngine(text: string): {
  engine: string;
  engineIsCummins: boolean | null;
  engineEvidence: string;
} {
  const cummins = text.match(/Cummins[^.,;\n]{0,40}/i);
  if (cummins) {
    return {
      engine: cummins[0].trim(),
      engineIsCummins: true,
      engineEvidence: cummins[0].trim(),
    };
  }
  const other = text.match(/\b(Paccar|Detroit|Power Stroke|Duramax|PSI)[^.,;\n]{0,30}/i);
  if (other) {
    return {
      engine: other[0].trim(),
      engineIsCummins: false,
      engineEvidence: other[0].trim(),
    };
  }
  return { engine: "", engineIsCummins: null, engineEvidence: "" };
}

function findTransmission(text: string): {
  transmission: string;
  transmissionIsAutomatic: boolean | null;
  transmissionEvidence: string;
} {
  const auto = text.match(/\b(Allison[^.,;\n]{0,30}|automatic(?:\s+transmission)?)\b/i);
  if (auto) {
    return {
      transmission: auto[0].trim(),
      transmissionIsAutomatic: true,
      transmissionEvidence: auto[0].trim(),
    };
  }
  const manual = text.match(/\b(manual(?:\s+transmission)?|stick)\b/i);
  if (manual) {
    return {
      transmission: manual[0].trim(),
      transmissionIsAutomatic: false,
      transmissionEvidence: manual[0].trim(),
    };
  }
  return { transmission: "", transmissionIsAutomatic: null, transmissionEvidence: "" };
}

function findBoxLength(text: string): { boxLengthFt: number | null; boxLengthEvidence: string } {
  const m = text.match(/\b(24|26|28)\s*(?:'|ft|foot|feet)\b/i);
  if (!m) return { boxLengthFt: null, boxLengthEvidence: "" };
  return { boxLengthFt: Number(m[1]), boxLengthEvidence: m[0] };
}

function findWeight(text: string): {
  manufacturerGvwrLbs: number | null;
  listedWeightLbs: number | null;
  listedWeightTerm: ListedWeightTerm;
  gvwrEvidence: string;
} {
  const gvwr = text.match(
    /\b(?:manufacturer[- ]rated\s+)?GVWR\b[^0-9]{0,12}([\d,]{4,6})\s*(?:lbs?|pounds)?/i
  );
  if (gvwr) {
    const lbs = Number(gvwr[1].replace(/,/g, ""));
    return {
      manufacturerGvwrLbs: Number.isFinite(lbs) ? lbs : null,
      listedWeightLbs: Number.isFinite(lbs) ? lbs : null,
      listedWeightTerm: "gvwr",
      gvwrEvidence: gvwr[0].trim(),
    };
  }
  // GVW alone is NOT manufacturer-rated GVWR
  const gvw = text.match(/\bGVW\b(?!R)[^0-9]{0,12}([\d,]{4,6})\s*(?:lbs?|pounds)?/i);
  if (gvw) {
    const lbs = Number(gvw[1].replace(/,/g, ""));
    return {
      manufacturerGvwrLbs: null,
      listedWeightLbs: Number.isFinite(lbs) ? lbs : null,
      listedWeightTerm: "gvw",
      gvwrEvidence: "",
    };
  }
  return {
    manufacturerGvwrLbs: null,
    listedWeightLbs: null,
    listedWeightTerm: "unknown",
    gvwrEvidence: "",
  };
}

function findMileage(text: string): number | null {
  const m = text.match(/\b([\d,]{2,7})\s*(?:miles|mi\.?)\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 1000 && n < 2_000_000 ? n : null;
}

function findPrice(text: string): { askingPrice: number | null; auctionCurrentBid: number | null } {
  const auction = text.match(/\b(?:current\s+bid|high\s+bid)\b[^$]{0,8}\$?\s*([\d,]+)/i);
  if (auction) {
    const n = Number(auction[1].replace(/,/g, ""));
    return {
      askingPrice: null,
      auctionCurrentBid: Number.isFinite(n) ? n : null,
    };
  }
  const price = text.match(/(?:asking|price|sale\s+price)?\s*\$\s*([\d,]{4,7})\b/i);
  if (price) {
    const n = Number(price[1].replace(/,/g, ""));
    return { askingPrice: Number.isFinite(n) ? n : null, auctionCurrentBid: null };
  }
  return { askingPrice: null, auctionCurrentBid: null };
}

function findLiftgate(text: string): boolean | null {
  if (/\bno\s+lift\s*gate\b/i.test(text) || /\bwithout\s+lift\s*gate\b/i.test(text)) {
    return false;
  }
  // "power liftgate" / "power lift gate" / plain liftgate
  if (
    /\bpower\s+lift(?:\s*gate)?\b/i.test(text) ||
    /\blift\s*gate\b/i.test(text) ||
    /\btuck[-\s]?away\s+lift(?:\s*gate)?\b/i.test(text)
  ) {
    return true;
  }
  return null;
}

function findLocation(text: string): string {
  const m = text.match(
    /\b([A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+)?),\s*([A-Z]{2})\b/
  );
  return m ? `${m[1]}, ${m[2]}` : "";
}

function hostnameSeller(url: string, fallback?: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return fallback || host.split(".")[0] || host;
  } catch {
    return fallback || "";
  }
}

/**
 * Map one page/snippet into a truck candidate. Fields stay null/empty when
 * the text does not clearly support them.
 */
export function extractTruckFromPageText(page: PageSnippet): ExtractedTruckCandidate {
  const text = `${page.title || ""}\n${page.content}`;
  const engine = findEngine(text);
  const transmission = findTransmission(text);
  const box = findBoxLength(text);
  const weight = findWeight(text);
  const year = findYear(text);
  const vin = findVin(text);
  const phone = findPhone(text);
  const prices = findPrice(text);
  const seller = page.sourceName || hostnameSeller(page.url);

  return {
    listingUrl: page.url,
    sourceName: seller,
    seller,
    stockNumber: findStock(text),
    vin: vin?.vin || "",
    year: year?.year ?? null,
    makeModel: findMakeModel(page.title || "", page.content),
    engine: engine.engine,
    engineIsCummins: engine.engineIsCummins,
    engineEvidence: engine.engineEvidence,
    transmission: transmission.transmission,
    transmissionIsAutomatic: transmission.transmissionIsAutomatic,
    transmissionEvidence: transmission.transmissionEvidence,
    boxLengthFt: box.boxLengthFt,
    boxLengthEvidence: box.boxLengthEvidence,
    manufacturerGvwrLbs: weight.manufacturerGvwrLbs,
    listedWeightLbs: weight.listedWeightLbs,
    listedWeightTerm: weight.listedWeightTerm,
    gvwrEvidence: weight.gvwrEvidence,
    mileage: findMileage(text),
    hasLiftgate: findLiftgate(text),
    askingPrice: prices.askingPrice,
    auctionCurrentBid: prices.auctionCurrentBid,
    location: findLocation(text),
    drivingDistanceMiles: null,
    distanceIsEstimate: true,
    phone: phone?.phone || "",
    contactName: "",
    contactRole: phone ? "Sales" : "",
    evidenceUrl: page.url,
    notes: [
      vin ? `VIN evidence: ${vin.quote}` : "",
      phone ? `Phone evidence: ${phone.quote}` : "",
      "Extracted only from published search/extract text — unknowns left blank.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export function extractContactFromPageText(page: PageSnippet): ExtractedContactCandidate | null {
  const phone = findPhone(page.content);
  if (!phone) return null;
  const company = page.sourceName || hostnameSeller(page.url);
  return {
    company,
    contactName: "",
    role: "Sales",
    phone: phone.phone,
    email: "",
    sourceUrl: page.url,
    supplierType: "Web search",
    evidenceQuote: phone.quote,
    notes: "Public phone found in published page/snippet text.",
  };
}
