export { SKL_DISTANCE_ORIGIN, type SkLDistanceOrigin } from "@/lib/sourcing/distance/origin";
export {
  EARTH_RADIUS_MILES,
  haversineMiles,
  roundMilesForClassification,
} from "@/lib/sourcing/distance/haversine";
export {
  normalizeCityName,
  normalizeStateCode,
  parseCityStateLocation,
  placeLookupKey,
  stripCensusPlaceSuffix,
  isUsStateCode,
  type ParsedUsLocation,
} from "@/lib/sourcing/distance/normalize-place";
export {
  resolveUsPlace,
  getUsPlacesLookup,
  getUsPlacesMeta,
  type UsPlaceCoords,
} from "@/lib/sourcing/distance/resolve-us-place";
export {
  estimateDistanceFromLocation,
  type DistanceEstimateResult,
  type DistanceEstimateSuccess,
  type DistanceEstimateFailure,
} from "@/lib/sourcing/distance/estimate-from-location";
