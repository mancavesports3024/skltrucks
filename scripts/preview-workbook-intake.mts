/**
 * Local preview of untracked dealer workbooks (no DB, no providers).
 * Usage: npx tsx scripts/preview-workbook-intake.mts /path/to/file.xls
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildWorkbookPreview } from "../src/lib/sourcing/intake/workbook";
import { DEFAULT_BUYING_PROFILE } from "../src/types/sourcing";
import { classifyLead } from "../src/lib/sourcing/match";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/preview-workbook-intake.mts <workbook>");
  process.exit(1);
}
const path = resolve(file);
if (!existsSync(path)) {
  console.error("File not found:", path);
  process.exit(1);
}

const buf = readFileSync(path);
const report = buildWorkbookPreview(buf, path.split("/").pop() || "workbook", [], {
  ...DEFAULT_BUYING_PROFILE,
});

// Analytical: specs excluding distance (local geocode not available)
let basicPass = 0;
let basicPassGvwOk = 0;
for (const plan of report.plans) {
  const withDistance = {
    ...plan.input,
    drivingDistanceMiles: 500,
  };
  const m = classifyLead(withDistance, DEFAULT_BUYING_PROFILE);
  if (m.status === "confirmed_match" || m.status === "out_of_range_opportunity") {
    basicPass += 1;
    const gvw = plan.input.manufacturerGvwrLbs ?? plan.input.listedWeightLbs;
    if (gvw != null && gvw <= 26000) basicPassGvwOk += 1;
  }
}

const summary = {
  filename: report.filename,
  detectedFormat: report.detectedFormat,
  sheetName: report.sheetName,
  workbookDate: report.workbookDate,
  usableLeads: report.usableLeads,
  confirmed: report.confirmed,
  needsVerification: report.needsVerification,
  rejected: report.rejected,
  skippedInvalid: report.skippedInvalid,
  basicCriteriaPassAssumingDistanceInRadius: basicPass,
  basicCriteriaPassWithGvwAtOrBelow26000: basicPassGvwOk,
  parseError: report.workbookParseError?.error ?? null,
};
console.log(JSON.stringify(summary, null, 2));

// Log unit 192018 if present (Hogan) without dumping full VIN lists
const u = report.previewRows.find((r) => r.unit === "192018");
if (u) {
  console.log(
    JSON.stringify(
      {
        unit: u.unit,
        year: u.year,
        makeModel: u.makeModel,
        mileage: u.mileage,
        price: u.price,
        location: u.location,
        gvwLbs: u.gvwLbs,
        summary: u.summary,
      },
      null,
      2
    )
  );
}
