export {
  parseWorkbookBuffer,
  type WorkbookParseResult,
  type WorkbookParseSuccess,
  type WorkbookParseFailure,
} from "@/lib/sourcing/intake/workbook/parse";
export {
  buildWorkbookPreview,
  buildWorkbookImportPlans,
  type WorkbookPreviewReport,
  type WorkbookPreviewRow,
} from "@/lib/sourcing/intake/workbook/preview";
export { PENSKE_PREAUCTION_SCOPE } from "@/lib/sourcing/intake/workbook/penske-preauction";
export { HOGAN_WHOLESALE_SCOPE } from "@/lib/sourcing/intake/workbook/hogan-wholesale";
export {
  parseWeightLbs,
  parseMileage,
  extractBoxLengthFt,
  isCumminsEngine,
  isAutomaticTransmission,
  parseLiftgate,
  parseOsLocation,
} from "@/lib/sourcing/intake/workbook/normalize";
export {
  isPenskePreauctionHeaders,
  isHoganWholesaleHeaders,
  detectWorkbookFormat,
} from "@/lib/sourcing/intake/workbook/detect";
export { validateInspectionUrl } from "@/lib/sourcing/intake/workbook/hogan-wholesale";
export {
  classifyPenskeUnitHyperlink,
  extractWorkbookHyperlinkTarget,
  maskHyperlinkForDiagnostics,
  INSPECTION_REJECT_UNSUPPORTED,
  INSPECTION_REJECT_UNSUPPORTED_NOTE,
  PENSKE_LISTING_ALLOWED_HOSTS,
  PENSKE_INSPECTION_ALLOWED_HOSTS,
} from "@/lib/sourcing/intake/workbook/unit-hyperlink";
export { workbookRowsToIntake } from "@/lib/sourcing/intake/workbook/to-intake";
