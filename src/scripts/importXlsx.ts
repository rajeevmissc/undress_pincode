/**
 * Load the combined DTDC + Delhivery workbook straight into MongoDB.
 *
 *   npm run import -- scripts/dtdc_delhivary_data.xlsx
 *   npm run import                # defaults to scripts/dtdc_delhivary_data.xlsx
 *
 * This is a FULL REFRESH: the pincodeserviceabilities collection is wiped and
 * rebuilt from the file, and the obsolete `pincoderates` collection is dropped.
 * A flat CSV snapshot is also written next to the xlsx for eyeballing.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { Workbook } from "exceljs";
import { connectDb } from "../db";
import { parseWorkbook, PincodeRecord } from "../services/pincodeDataset";
import { replaceAllPincodes } from "../services/pincodeStore";

const DEFAULT_FILE = path.join("scripts", "dtdc_delhivary_data.xlsx");

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeFlatCsv(records: PincodeRecord[], outPath: string): void {
  const header = [
    "pincode", "zone", "state", "serviceable",
    "dtdc_serviceable",
    "dtdc_surface_available", "dtdc_surface_price", "dtdc_surface_days",
    "dtdc_air_available", "dtdc_air_price", "dtdc_air_days",
    "dtdc_cod_available", "dtdc_cod_price",
    "delhivery_serviceable",
    "delhivery_standard_available", "delhivery_standard_price",
    "delhivery_cod_available", "delhivery_cod_price",
  ];
  const lines = [header.join(",")];
  for (const r of records) {
    lines.push([
      r.pincode, r.zone, r.state, r.serviceable,
      r.dtdc.serviceable,
      r.dtdc.surface?.available ?? false, r.dtdc.surface?.price ?? "", r.dtdc.surface?.transitDays ?? "",
      r.dtdc.air?.available ?? false, r.dtdc.air?.price ?? "", r.dtdc.air?.transitDays ?? "",
      r.dtdc.cod.available, r.dtdc.cod.price ?? "",
      r.delhivery.serviceable,
      r.delhivery.standard?.available ?? false, r.delhivery.standard?.price ?? "",
      r.delhivery.cod.available, r.delhivery.cod.price ?? "",
    ].map(csvCell).join(","));
  }
  fs.writeFileSync(outPath, lines.join("\n") + "\n");
}

async function main() {
  const file = process.argv[2] || DEFAULT_FILE;
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  console.log(`Reading ${file} ...`);
  const wb = new Workbook();
  await wb.xlsx.readFile(file);
  const { records, zoneCodFees, warnings } = parseWorkbook(wb);
  console.log(`Parsed ${records.length} pincodes. Delhivery COD fee by zone:`, zoneCodFees);
  if (warnings.length) {
    console.warn(`${warnings.length} warning(s):`);
    warnings.slice(0, 25).forEach((w) => console.warn("  - " + w));
  }
  if (records.length === 0) {
    console.error("Nothing to import.");
    process.exit(1);
  }

  const csvOut = path.join(path.dirname(file), "pincode_data_flat.csv");
  writeFlatCsv(records, csvOut);
  console.log(`Wrote snapshot ${csvOut}`);

  await connectDb();
  const summary = await replaceAllPincodes(records);

  console.log("\nImport complete:");
  console.log(`  inserted            ${summary.inserted}`);
  console.log(`  serviceable         ${summary.serviceable}`);
  console.log(`  via DTDC            ${summary.dtdcServiceable}`);
  console.log(`  via Delhivery only  ${summary.delhiveryFallback}`);
  console.log(`  no service          ${summary.noService}`);
  if (summary.legacyCollectionsDropped.length) {
    console.log(`  dropped legacy      ${summary.legacyCollectionsDropped.join(", ")}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
