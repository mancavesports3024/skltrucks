import placesDataset from "../../../../data/us-census-places-2024.json";
import {
  placeLookupKey,
  stripCensusPlaceSuffix,
} from "@/lib/sourcing/distance/normalize-place";

export type UsPlaceCoords = {
  latitude: number;
  longitude: number;
  key: string;
  displayCity: string;
  state: string;
};

type PlacesPayload = {
  schemaVersion: number;
  placeCount: number;
  places: Record<string, [number, number]>;
};

const dataset = placesDataset as PlacesPayload;

/** Bundled Census 2024 places lookup — no network access. */
export function getUsPlacesLookup(): Readonly<Record<string, [number, number]>> {
  return dataset.places;
}

export function getUsPlacesMeta(): {
  schemaVersion: number;
  placeCount: number;
} {
  return {
    schemaVersion: dataset.schemaVersion,
    placeCount: dataset.placeCount,
  };
}

/**
 * Resolve a U.S. city + state to Census internal-point coordinates.
 * Requires both city and state. Never matches on city alone.
 *
 * Tries the raw normalized name first (keeps "Kansas City"), then a
 * Census-suffix-stripped variant ("Joplin City" → "Joplin") so staff
 * phrasing still hits gazetteer keys built from "Joplin city".
 */
export function resolveUsPlace(
  city: string,
  stateCode: string
): UsPlaceCoords | null {
  const state = stateCode.trim().toUpperCase();
  if (!city.trim() || state.length !== 2) return null;

  const candidates = [placeLookupKey(city, state)];
  const stripped = stripCensusPlaceSuffix(city);
  if (stripped && stripped !== city.trim()) {
    const alt = placeLookupKey(stripped, state);
    if (alt !== candidates[0]) candidates.push(alt);
  }

  for (const key of candidates) {
    const coords = dataset.places[key];
    if (!coords) continue;
    const [latitude, longitude] = coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    return {
      latitude,
      longitude,
      key,
      displayCity: city.replace(/\s+/g, " ").trim(),
      state,
    };
  }

  return null;
}
