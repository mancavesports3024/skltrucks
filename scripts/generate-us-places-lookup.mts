/**
 * Regenerate data/us-census-places-2024.json from the Census Gazetteer zip.
 *
 * Usage (from repo root, after downloading the zip):
 *   npx tsx scripts/generate-us-places-lookup.mts /path/to/2024_Gaz_place_national.txt \
 *     --zip-sha256 <sha> --txt-sha256 <sha>
 *
 * Prefer re-running the documented download steps in docs/sourcing-distance-offline.md.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SUFFIX_RE =
  /\s+(city|town|village|cdp|borough|municipality|consolidated government|metro government|unified government|city and borough|municipio)\s*$/i;

/** Normalize Census NAME → lookup key (strip one legal-type suffix, then tokenize). */
export function normalizeCityName(name: string): string {
  let s = String(name ?? "").trim();
  s = s.replace(SUFFIX_RE, "");
  s = s.replace(/\./g, " ");
  s = s.replace(/\bst\b/gi, "saint");
  s = s.replace(/\bft\b/gi, "fort");
  s = s.replace(/[^a-zA-Z0-9\s'-]/g, " ");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}

function main() {
  const txtPath = resolve(process.argv[2] || "");
  if (!txtPath || !existsSync(txtPath)) {
    console.error("Usage: npx tsx scripts/generate-us-places-lookup.mts <gazetteer.txt>");
    process.exit(1);
  }
  const zipPath = txtPath.replace(/\.txt$/i, ".zip");
  const zipSha = existsSync(zipPath)
    ? createHash("sha256").update(readFileSync(zipPath)).digest("hex")
    : process.argv.find((a) => a.startsWith("--zip-sha256="))?.slice(13) || "";
  const txtSha = createHash("sha256").update(readFileSync(txtPath)).digest("hex");

  const lines = readFileSync(txtPath, "utf8").split(/\r?\n/).filter(Boolean);
  const header = lines[0].split("\t").map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  type Cand = { lat: number; lon: number; land: number; func: string };
  const best = new Map<string, Cand>();

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split("\t");
    const usps = (cols[idx.USPS] || "").trim().toUpperCase();
    const name = (cols[idx.NAME] || "").trim();
    const func = (cols[idx.FUNCSTAT] || "").trim();
    const land = Number(cols[idx.ALAND] || 0);
    const lat = Number(cols[idx.INTPTLAT]);
    const lon = Number(cols[idx.INTPTLONG]);
    if (!usps || usps.length !== 2 || !name) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const city = normalizeCityName(name);
    if (!city) continue;
    const key = `${city}|${usps.toLowerCase()}`;
    const cand: Cand = { lat, lon, land, func };
    const prev = best.get(key);
    if (!prev) {
      best.set(key, cand);
      continue;
    }
    const prevRank = prev.func === "A" ? 2 : prev.func === "S" ? 0 : 1;
    const candRank = cand.func === "A" ? 2 : cand.func === "S" ? 0 : 1;
    if (candRank > prevRank || (candRank === prevRank && cand.land > prev.land)) {
      best.set(key, cand);
    }
  }

  const places: Record<string, [number, number]> = {};
  for (const [key, v] of best) {
    places[key] = [Number(v.lat.toFixed(5)), Number(v.lon.toFixed(5))];
  }

  const outPath = resolve("data/us-census-places-2024.json");
  const payload = {
    schemaVersion: 1,
    source: {
      name: "U.S. Census Bureau National Places Gazetteer Files",
      year: 2024,
      file: "2024_Gaz_place_national.txt",
      url: "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_place_national.zip",
      license: "U.S. Government work — public domain (no copyright)",
      downloadedNote: "Coordinates are Census internal points (INTPTLAT/INTPTLONG).",
      zipSha256: zipSha,
      txtSha256: txtSha,
    },
    keyFormat: "normalizedCity|st (lowercase); St./Saint and Ft./Fort collapsed",
    placeCount: Object.keys(places).length,
    places,
  };
  writeFileSync(outPath, JSON.stringify(payload));
  console.log(
    JSON.stringify(
      { outPath, placeCount: payload.placeCount, bytes: statSync(outPath).size, joplin: places["joplin|mo"] },
      null,
      2
    )
  );
}

main();
