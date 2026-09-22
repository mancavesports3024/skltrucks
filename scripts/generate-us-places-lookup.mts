/**
 * Regenerate data/us-census-places-2024.json from the Census Gazetteer zip.
 *
 * Usage (from repo root, after downloading the zip):
 *   npx tsx scripts/generate-us-places-lookup.mts /path/to/2024_Gaz_place_national.txt
 *
 * Prefer re-running the documented download steps in docs/sourcing-distance-offline.md.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SUFFIX_RE =
  /\s+(city|town|village|cdp|borough|municipality|consolidated government|metro government|unified government|city and borough|municipio)\s*$/i;

/**
 * Normalize a Census PLACE name into one or more lookup keys.
 * - Drops parentheticals such as "(balance)" (e.g. Indianapolis city (balance)).
 * - Strips one legal-type suffix (city/town/village/…).
 * - For New England-style "X Town" remainders (e.g. Braintree Town city → Braintree Town),
 *   also emits an alias without the trailing "Town" so staff "Braintree, MA" resolves.
 * Does not strip a second bare "City" (preserves Kansas City).
 */
export function censusNameKeys(name: string): string[] {
  let s = String(name ?? "").trim();
  s = s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(SUFFIX_RE, "").trim();
  s = s.replace(/\./g, " ");
  s = s.replace(/\bst\b/gi, "saint");
  s = s.replace(/\bft\b/gi, "fort");
  s = s.replace(/[^a-zA-Z0-9\s'-]/g, " ");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  if (!s) return [];
  const keys = [s];
  if (/\stown$/.test(s)) {
    const withoutTown = s.replace(/\stown$/, "").trim();
    if (withoutTown && withoutTown !== s) keys.push(withoutTown);
  }
  return keys;
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

  function consider(key: string, cand: Cand) {
    const prev = best.get(key);
    if (!prev) {
      best.set(key, cand);
      return;
    }
    const prevRank = prev.func === "A" ? 2 : prev.func === "S" ? 0 : 1;
    const candRank = cand.func === "A" ? 2 : cand.func === "S" ? 0 : 1;
    if (candRank > prevRank || (candRank === prevRank && cand.land > prev.land)) {
      best.set(key, cand);
    }
  }

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
    const cand: Cand = { lat, lon, land, func };
    for (const city of censusNameKeys(name)) {
      consider(`${city}|${usps.toLowerCase()}`, cand);
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
      downloadedNote:
        "Coordinates are Census internal points (INTPTLAT/INTPTLONG). Parentheticals like (balance) stripped; New England 'X Town city' also keyed as 'X'.",
      zipSha256: zipSha,
      txtSha256: txtSha,
    },
    keyFormat:
      "normalizedCity|st (lowercase); St./Saint and Ft./Fort collapsed; (balance) dropped; Town aliases for New England",
    placeCount: Object.keys(places).length,
    places,
  };
  writeFileSync(outPath, JSON.stringify(payload));

  const metaPath = resolve("data/us-census-places-2024.meta.json");
  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        name: payload.source.name,
        year: payload.source.year,
        file: payload.source.file,
        url: payload.source.url,
        license: payload.source.license,
        downloadedNote: payload.source.downloadedNote,
        zipSha256: zipSha,
        txtSha256: txtSha,
        placeCount: payload.placeCount,
        outputBytes: statSync(outPath).size,
        generatedAt: new Date().toISOString(),
        joplinMoKey: "joplin|mo",
        joplinMo: places["joplin|mo"],
        sampleKeys: {
          indianapolisIn: places["indianapolis|in"],
          braintreeMa: places["braintree|ma"],
          kansasCityMo: places["kansas city|mo"],
        },
      },
      null,
      2
    ) + "\n"
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        placeCount: payload.placeCount,
        bytes: statSync(outPath).size,
        joplin: places["joplin|mo"],
        indianapolis: places["indianapolis|in"],
        braintree: places["braintree|ma"],
        kansasCity: places["kansas city|mo"],
      },
      null,
      2
    )
  );
}

main();
