/**
 * Fixed SKL sourcing origin for offline workbook distance estimates.
 *
 * Coordinates are the U.S. Census Bureau 2024 National Places Gazetteer
 * internal point for "Joplin city", Missouri (GEOID 2937592).
 * Rounded to five decimal degrees to match the bundled places lookup.
 *
 * This is a city internal point — not a street address geocode and not
 * driving-route origin. See docs/sourcing-distance-offline.md.
 */
export const SKL_DISTANCE_ORIGIN = {
  label: "Joplin, Missouri",
  city: "Joplin",
  state: "MO",
  /** Census 2024 Places Gazetteer INTPTLAT for Joplin city, MO */
  latitude: 37.07522,
  /** Census 2024 Places Gazetteer INTPTLONG for Joplin city, MO */
  longitude: -94.50126,
  gazetteerKey: "joplin|mo",
  method: "haversine_straight_line" as const,
  methodLabel: "Estimated straight-line distance",
} as const;

export type SkLDistanceOrigin = typeof SKL_DISTANCE_ORIGIN;
