/**
 * npm run validate-data
 *
 * Runs every pincode in scripts/dtdc_delhivary_data.xlsx through the real
 * production resolver and checks the invariants that matter for checkout:
 *   - a serviceable pincode always yields at least one option
 *   - every option has a finite price >= 0
 *   - a COD option always has a defined price
 *   - when DTDC serves a pincode, every prepaid (non-COD) option is DTDC's own;
 *     the only option allowed to carry a different courier is a COD row borrowed
 *     from Delhivery (only when DTDC itself has no COD for that pincode)
 *   - the public payload always contains a courier name
 */
import path from "path";
import { Workbook } from "exceljs";
import { parseWorkbook } from "../src/services/pincodeDataset";
import { resolveFromRecord, toPublicServiceability, PincodeInput } from "../src/services/rateResolver";

const FILE = path.join(__dirname, "dtdc_delhivary_data.xlsx");

async function main() {
  const wb = new Workbook();
  await wb.xlsx.readFile(FILE);
  const { records, zoneCodFees, warnings } = parseWorkbook(wb);

  console.log(`Parsed ${records.length} pincodes.`);
  console.log("Delhivery COD fee by zone:", zoneCodFees);
  if (warnings.length) {
    console.log(`\n${warnings.length} parser warning(s) (first 10):`);
    warnings.slice(0, 10).forEach((w) => console.log("  - " + w));
  }

  let issues = 0;
  const tally = {
    serviceable: 0,
    viaDtdc: 0,
    viaDelhivery: 0,
    withStandard: 0,
    withPriority: 0,
    withCod: 0,
    withDtdcOwnCod: 0,
    withBorrowedDelhiveryCod: 0,
    noService: 0,
  };

  const samples = ["110001", "121014", "744103", "785101", "473554"];

  for (const rec of records) {
    const resolved = resolveFromRecord(rec.pincode, rec as unknown as PincodeInput);
    const pub = JSON.stringify(toPublicServiceability(resolved));

    if (!resolved.serviceable) {
      tally.noService++;
      if (rec.serviceable) {
        console.error(`ISSUE ${rec.pincode}: file says serviceable but resolver says no`);
        issues++;
      }
      continue;
    }

    tally.serviceable++;
    if (resolved.courier === "DTDC") tally.viaDtdc++;
    if (resolved.courier === "DELHIVERY") tally.viaDelhivery++;
    if (resolved.options.some((o) => o.code === "STANDARD")) tally.withStandard++;
    if (resolved.options.some((o) => o.code === "PRIORITY")) tally.withPriority++;
    const codOpt = resolved.options.find((o) => o.code === "COD");
    if (codOpt) {
      tally.withCod++;
      if (codOpt.courier === "DTDC") tally.withDtdcOwnCod++;
      if (codOpt.courier === "DELHIVERY" && resolved.courier === "DTDC") tally.withBorrowedDelhiveryCod++;
    }

    if (resolved.options.length === 0) {
      console.error(`ISSUE ${rec.pincode}: serviceable but produced no options`);
      issues++;
    }
    for (const o of resolved.options) {
      if (!Number.isFinite(o.price) || o.price < 0) {
        console.error(`ISSUE ${rec.pincode}: option ${o.code} bad price ${o.price}`);
        issues++;
      }
      if (o.code === "COD" && (o.price === undefined || o.price === null || Number.isNaN(o.price))) {
        console.error(`ISSUE ${rec.pincode}: COD option without a price`);
        issues++;
      }
    }
    if (resolved.courier === "DTDC" && rec.dtdc.serviceable === false) {
      console.error(`ISSUE ${rec.pincode}: resolved via DTDC but DTDC not serviceable`);
      issues++;
    }
    if (rec.dtdc.serviceable && resolved.courier !== "DTDC") {
      console.error(`ISSUE ${rec.pincode}: DTDC serves it but resolver used ${resolved.courier}`);
      issues++;
    }
    if (!["DTDC", "DELHIVERY", "SPEEDPOST"].includes(resolved.courier)) {
      console.error(`ISSUE ${rec.pincode}: unexpected courier "${resolved.courier}"`);
      issues++;
    }
    // Every option must carry the pincode's fulfilling courier, EXCEPT a COD row
    // borrowed from Delhivery when DTDC serves the pincode but has no COD itself.
    for (const o of resolved.options) {
      const isBorrowedCod = resolved.courier === "DTDC" && o.code === "COD" && o.courier === "DELHIVERY";
      if (o.courier !== resolved.courier && !isBorrowedCod) {
        console.error(`ISSUE ${rec.pincode}: option ${o.code} courier "${o.courier}" does not match result courier "${resolved.courier}"`);
        issues++;
      }
    }
    // Every non-COD (prepaid) option must always be DTDC's own when DTDC serves the pincode.
    if (resolved.courier === "DTDC" && resolved.options.some((o) => o.code !== "COD" && o.courier !== "DTDC")) {
      console.error(`ISSUE ${rec.pincode}: a prepaid option leaked a non-DTDC courier`);
      issues++;
    }
    // The borrowed-COD fallback must only fire when DTDC truly has no COD of its own.
    if (codOpt?.courier === "DELHIVERY" && resolved.courier === "DTDC" && rec.dtdc.cod?.available) {
      console.error(`ISSUE ${rec.pincode}: borrowed Delhivery COD shown even though DTDC has its own COD`);
      issues++;
    }
    // And it must only fire when Delhivery actually flags COD for that pincode.
    if (codOpt?.courier === "DELHIVERY" && resolved.courier === "DTDC" && !rec.delhivery?.cod?.available) {
      console.error(`ISSUE ${rec.pincode}: borrowed Delhivery COD shown but Delhivery has no COD on file`);
      issues++;
    }
    // If DTDC has no COD and Delhivery does, the customer must NOT be left without COD.
    if (resolved.courier === "DTDC" && !rec.dtdc.cod?.available && rec.delhivery?.cod?.available && !codOpt) {
      console.error(`ISSUE ${rec.pincode}: Delhivery COD available but resolver produced no COD option`);
      issues++;
    }
    // Borrowed Delhivery COD must price at Delhivery's own Standard price (120 / 150 NE),
    // never the small zone COD handling fee.
    if (codOpt?.courier === "DELHIVERY" && resolved.courier === "DTDC" && rec.delhivery?.standard) {
      if (codOpt.price !== rec.delhivery.standard.price) {
        console.error(`ISSUE ${rec.pincode}: borrowed Delhivery COD priced ${codOpt.price}, expected Standard price ${rec.delhivery.standard.price}`);
        issues++;
      }
    }
    if (!/"courier":/.test(pub)) {
      console.error(`ISSUE ${rec.pincode}: courier missing from public payload`);
      issues++;
    }

    if (samples.includes(rec.pincode)) {
      console.log(`\n${rec.pincode} (${rec.zone}) ->`, pub);
    }
  }

  console.log("\nTally:", tally);
  console.log(`\nChecked all ${records.length} pincodes.`);
  console.log(issues === 0 ? "NO ISSUES FOUND" : `${issues} ISSUE(S) FOUND`);
  process.exit(issues === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
