/**
 * Strict JSON Schemas for OpenAI Responses API structured outputs.
 * Keep additionalProperties: false and required arrays for strict mode.
 */

export const DISCOVERY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["listingUrls", "queriesUsed", "sourcesConsulted", "notes"],
  properties: {
    listingUrls: {
      type: "array",
      items: { type: "string" },
    },
    queriesUsed: {
      type: "array",
      items: { type: "string" },
    },
    sourcesConsulted: {
      type: "array",
      items: { type: "string" },
    },
    notes: { type: "string" },
  },
} as const;

export const INSPECT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["truck", "contact", "rejectReason"],
  properties: {
    truck: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "listingUrl",
            "sourceName",
            "seller",
            "stockNumber",
            "vin",
            "year",
            "makeModel",
            "engine",
            "engineIsCummins",
            "engineEvidence",
            "transmission",
            "transmissionIsAutomatic",
            "transmissionEvidence",
            "boxLengthFt",
            "boxLengthEvidence",
            "manufacturerGvwrLbs",
            "listedWeightLbs",
            "listedWeightTerm",
            "gvwrEvidence",
            "mileage",
            "hasLiftgate",
            "askingPrice",
            "auctionCurrentBid",
            "location",
            "drivingDistanceMiles",
            "distanceIsEstimate",
            "phone",
            "contactName",
            "contactRole",
            "evidenceUrl",
            "notes",
          ],
          properties: {
            listingUrl: { type: "string" },
            sourceName: { type: "string" },
            seller: { type: "string" },
            stockNumber: { type: "string" },
            vin: { type: "string" },
            year: { type: ["number", "null"] },
            makeModel: { type: "string" },
            engine: { type: "string" },
            engineIsCummins: { type: ["boolean", "null"] },
            engineEvidence: { type: "string" },
            transmission: { type: "string" },
            transmissionIsAutomatic: { type: ["boolean", "null"] },
            transmissionEvidence: { type: "string" },
            boxLengthFt: { type: ["number", "null"] },
            boxLengthEvidence: { type: "string" },
            manufacturerGvwrLbs: { type: ["number", "null"] },
            listedWeightLbs: { type: ["number", "null"] },
            listedWeightTerm: {
              type: "string",
              enum: ["gvwr", "gvw", "unknown"],
            },
            gvwrEvidence: { type: "string" },
            mileage: { type: ["number", "null"] },
            hasLiftgate: { type: ["boolean", "null"] },
            askingPrice: { type: ["number", "null"] },
            auctionCurrentBid: { type: ["number", "null"] },
            location: { type: "string" },
            drivingDistanceMiles: { type: ["number", "null"] },
            distanceIsEstimate: { type: "boolean" },
            phone: { type: "string" },
            contactName: { type: "string" },
            contactRole: { type: "string" },
            evidenceUrl: { type: "string" },
            notes: { type: "string" },
          },
        },
      ],
    },
    contact: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "companyName",
            "contactName",
            "role",
            "phone",
            "email",
            "sourceUrl",
            "supplierType",
            "evidenceQuote",
            "notes",
          ],
          properties: {
            companyName: { type: "string" },
            contactName: { type: "string" },
            role: { type: "string" },
            phone: { type: "string" },
            email: { type: "string" },
            sourceUrl: { type: "string" },
            supplierType: { type: "string" },
            evidenceQuote: { type: "string" },
            notes: { type: "string" },
          },
        },
      ],
    },
    rejectReason: { type: "string" },
  },
} as const;

export function discoveryTextFormat() {
  return {
    format: {
      type: "json_schema" as const,
      name: "sourcing_discovery",
      strict: true,
      schema: DISCOVERY_JSON_SCHEMA,
    },
  };
}

export function inspectTextFormat() {
  return {
    format: {
      type: "json_schema" as const,
      name: "sourcing_inspect",
      strict: true,
      schema: INSPECT_JSON_SCHEMA,
    },
  };
}
