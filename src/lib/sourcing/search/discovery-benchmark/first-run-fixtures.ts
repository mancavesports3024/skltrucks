/**
 * Sanitized fixtures from live Tavily run 1 (PR #33 @ 744e10e).
 * Manual verification: effectively 0 true individual unit VDPs among 20 retained.
 * Used only for offline classification regression — never re-fetched as production data.
 */
export const FIRST_RUN_RETAINED_URL_FIXTURES = [
  {
    id: "dc-freightlinerfl-category",
    url: "https://www.freightlinerfl.com/delivery-moving-straight-box-trucks-for-sale-i2c44f0m0",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "dc-freightlinermiami-make",
    url: "https://www.freightlinermiami.com/freightliner-m2-for-sale-i0c0f20m198464",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "miller-make-index",
    url: "https://millerusedtrucks.com/trucks-for-sale/box-van-truck/freightliner",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "soarr-fl-m2-box",
    url: "https://www.soarr.com/for-sale/trucks/10/freightliner/m2/box-trucks-for-sale",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "comvoy-model-family",
    url: "https://www.comvoy.com/vehicles/international/mv-16j5",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "truckertotrucker-make-index",
    url: "https://truckertotrucker.com/trucks-for-sale/box-truck/international",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "tractorhouse-listings-search",
    url: "https://www.tractorhouse.com/listings/international-mv-medium-duty-trucks-for-sale?class=10&category=16000&manufacturer=international&modelgroup=mv",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "soarr-kw-colorado",
    url: "https://www.soarr.com/for-sale/trucks/10/kenworth/t270/box-trucks-for-sale-in-colorado",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "soarr-kw-all",
    url: "https://www.soarr.com/for-sale/trucks/0/kenworth/t270/all-for-sale",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "dc-crg-category",
    url: "https://www.crgtrucksales.com/delivery-moving-straight-box-trucks-for-sale-i2c44f0m0",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "ebay-browse-box",
    url: "https://www.ebay.com/b/box-trucks-cube-vans/80762/bn_16581769",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "dc-truckandvan-category",
    url: "https://www.truckandvanoutlet.com/delivery-moving-straight-box-trucks-for-sale-i2c44f0m0",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "dc-mls-category",
    url: "https://www.mylittlesalesman.com/delivery-moving-straight-box-trucks-for-sale-i2c44f0m0",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "dc-rhodeisland-category",
    url: "https://www.rhodeislandtruckcenter.com/delivery-moving-straight-box-trucks-for-sale-i2c44f0m0?s=12",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "globetrucks-box-filter",
    url: "https://www.globetrucks.com/box-truck",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "mls-california-geo",
    url: "https://www.mylittlesalesman.com/hp/box-trucks-for-sale-in-california",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "ebay-shop-search",
    url: "https://www.ebay.com/shop/box-trucks-for-sale?_nkw=box+trucks+for+sale",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "dc-truckandvan-intl-category",
    url: "https://www.truckandvanoutlet.com/international-delivery-moving-straight-box-trucks-for-sale-i2c44f339m0",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "ebay-browse-freightliner",
    url: "https://www.ebay.com/b/freightliner-box-trucks-cube-vans/80762/bn_7116073133",
    expectedBucket: "hub_or_category" as const,
  },
  {
    id: "lilley-box-category",
    url: "https://lilleyinternational.com/work-trucks-for-sale/box-trucks-for-sale",
    expectedBucket: "hub_or_category" as const,
  },
] as const;

/** Proven unit VDP shapes that must remain individual_listing after hardening. */
export const PROVEN_UNIT_VDP_FIXTURES = [
  {
    id: "debary-inventory-slug",
    url: "https://www.debarytrucksales.com/inventory/used-2019-freightliner-m2-106-box-9001",
    expectedBucket: "individual_listing" as const,
  },
  {
    id: "penske-unit",
    url: "https://www.penskeusedtrucks.com/truck-types/light-and-medium-duty/medium-duty-box-trucks/unit-228474",
    expectedBucket: "individual_listing" as const,
  },
  {
    id: "ctt-numeric",
    url: "https://www.commercialtrucktrader.com/Freightliner-M2-Box-Truck/2019-Fort-Worth-TX-1234567890",
    expectedBucket: "individual_listing" as const,
  },
  {
    id: "inventory-numeric-leaf",
    url: "https://www.stapletonmotors.com/inventory/2019-kenworth-t270-/917966",
    expectedBucket: "individual_listing" as const,
  },
] as const;

/** Ambiguous unit-shaped paths → likely, never individual without positive evidence. */
export const AMBIGUOUS_UNIT_FIXTURES = [
  {
    id: "inventory-weak-slug",
    url: "https://www.example-dealer.com/inventory/used-freightliner-box",
    expectedBucket: "likely_listing_needs_inspection" as const,
  },
] as const;
