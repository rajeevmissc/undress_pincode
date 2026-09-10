/**
 * npm run test-resolver   -   no database, pure logic test of resolveFromRecord.
 *
 * Covers the rules agreed for the dtdc_delhivary_data.xlsx model:
 *  - DTDC serves  -> only DTDC options (Standard = Surface/free, Priority = Air, COD when flagged)
 *  - DTDC absent  -> Delhivery fallback: one Standard option + COD when flagged
 *  - a null tier means "not offered", never "offered for free"
 *  - the delivery partner (courier) is included on the result and every option
 */
import {
  resolveFromRecord,
  toPublicServiceability,
  PincodeInput,
} from "../services/rateResolver";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  ASSERTION FAILED: ${msg}`);
    failures++;
  }
}

const tier = (price: number, days: number | null) => ({ available: true, price, transitDays: days, transitLabel: null });

// 1. DTDC full service: Surface + Air + COD
{
  const rec: PincodeInput = {
    serviceable: true,
    dtdc: { serviceable: true, surface: tier(0, 2), air: tier(50, 2), cod: { available: true, price: 50, transitDays: null, transitLabel: null } },
    delhivery: { serviceable: true, standard: tier(120, null), cod: { available: true, price: 50, transitDays: null, transitLabel: null } },
  } as PincodeInput;
  const r = resolveFromRecord("110001", rec);
  console.log("110001 full DTDC:", JSON.stringify(r));
  assert(r.serviceable && r.courier === "DTDC", "110001 serviceable via DTDC");
  assert(r.options.length === 3, "110001 has 3 options");
  const byCode = Object.fromEntries(r.options.map((o) => [o.code, o]));
  assert(byCode.STANDARD?.price === 0 && byCode.STANDARD?.transitDays === 2, "110001 STANDARD free, 2 days");
  assert(byCode.PRIORITY?.price === 50, "110001 PRIORITY = 50");
  assert(byCode.COD?.price === 50 && byCode.COD?.cod === true, "110001 COD = 50, cod flag true");
  assert(r.options.every((o) => o.courier === "DTDC"), "110001 every option tagged courier DTDC");
  assert(toPublicServiceability(r).courier === "DTDC", "110001 public payload includes courier DTDC");
}

// 2. DTDC Surface-only (the 8,746-pincode real shape): no Air, no COD
{
  const rec: PincodeInput = {
    serviceable: true,
    dtdc: { serviceable: true, surface: tier(0, 8), air: null, cod: { available: false, price: null, transitDays: null, transitLabel: null } },
    delhivery: { serviceable: false, standard: null, cod: { available: false, price: null, transitDays: null, transitLabel: null } },
  } as PincodeInput;
  const r = resolveFromRecord("121014", rec);
  console.log("121014 surface-only:", JSON.stringify(r));
  assert(r.options.length === 1 && r.options[0].code === "STANDARD", "121014 exactly one STANDARD option");
  assert(r.options[0].price === 0 && r.options[0].transitDays === 8, "121014 STANDARD free, 8 days");
  assert(!r.options.some((o) => o.code === "PRIORITY"), "121014 NO phantom PRIORITY from a null Air tier");
  assert(!r.options.some((o) => o.code === "COD"), "121014 no COD");
}

// 3. DTDC Air-only (the 4-pincode real shape): no Surface
{
  const rec: PincodeInput = {
    serviceable: true,
    dtdc: { serviceable: true, surface: null, air: tier(100, 7), cod: { available: false, price: null, transitDays: null, transitLabel: null } },
    delhivery: { serviceable: false, standard: null, cod: { available: false, price: null, transitDays: null, transitLabel: null } },
  } as PincodeInput;
  const r = resolveFromRecord("744103", rec);
  console.log("744103 air-only:", JSON.stringify(r));
  assert(r.options.length === 1 && r.options[0].code === "PRIORITY", "744103 exactly one PRIORITY option");
  assert(r.options[0].price === 100 && r.options[0].transitDays === 7, "744103 PRIORITY 100, 7 days");
  assert(!r.options.some((o) => o.code === "STANDARD"), "744103 NO phantom STANDARD from a null Surface tier");
}

// 4. DTDC serves but has NO COD, and Delhivery ALSO serves -> Delhivery must NOT leak in
{
  const rec: PincodeInput = {
    serviceable: true,
    dtdc: { serviceable: true, surface: tier(0, 6), air: tier(82, 3), cod: { available: false, price: null, transitDays: null, transitLabel: null } },
    delhivery: { serviceable: true, standard: tier(120, null), cod: { available: true, price: 82, transitDays: null, transitLabel: null } },
  } as PincodeInput;
  const r = resolveFromRecord("500001", rec);
  console.log("500001 DTDC no-COD, Delhivery ignored:", JSON.stringify(r));
  assert(r.courier === "DTDC", "500001 fulfilled by DTDC");
  assert(r.options.map((o) => o.code).sort().join(",") === "PRIORITY,STANDARD", "500001 only DTDC Standard+Priority");
  assert(!r.options.some((o) => o.code === "COD"), "500001 NO COD (DTDC has none, Delhivery not used as fallback here)");
}

// 5. Delhivery-only, North East: Standard price 150 + COD 100, fixed transit label
{
  const rec: PincodeInput = {
    serviceable: true,
    dtdc: { serviceable: false, surface: null, air: null, cod: { available: false, price: null, transitDays: null, transitLabel: null } },
    delhivery: { serviceable: true, standard: tier(150, null), cod: { available: true, price: 100, transitDays: null, transitLabel: null } },
  } as PincodeInput;
  const r = resolveFromRecord("785101", rec);
  console.log("785101 Delhivery-only NE:", JSON.stringify(r));
  assert(r.courier === "DELHIVERY", "785101 fulfilled by Delhivery");
  const byCode = Object.fromEntries(r.options.map((o) => [o.code, o]));
  assert(byCode.STANDARD?.price === 150 && byCode.STANDARD?.transitDays === null, "785101 STANDARD = 150, no day number");
  assert(byCode.STANDARD?.transitLabel === "8-10 business days", "785101 STANDARD fixed label");
  assert(byCode.COD?.price === 100 && byCode.COD?.cod === true, "785101 COD = 100");
  assert(!r.options.some((o) => o.code === "PRIORITY"), "785101 no Priority for Delhivery");
}

// 6. Delhivery-only, North zone: Standard 120 + COD 50
{
  const rec: PincodeInput = {
    serviceable: true,
    dtdc: { serviceable: false, surface: null, air: null, cod: { available: false, price: null, transitDays: null, transitLabel: null } },
    delhivery: { serviceable: true, standard: tier(120, null), cod: { available: true, price: 50, transitDays: null, transitLabel: null } },
  } as PincodeInput;
  const r = resolveFromRecord("473554", rec);
  assert(r.options.find((o) => o.code === "STANDARD")?.price === 120, "473554 STANDARD = 120");
  assert(r.options.find((o) => o.code === "COD")?.price === 50, "473554 COD = 50");
}

// 7. Delhivery-only, prepaid but no COD
{
  const rec: PincodeInput = {
    serviceable: true,
    dtdc: { serviceable: false, surface: null, air: null, cod: { available: false, price: null, transitDays: null, transitLabel: null } },
    delhivery: { serviceable: true, standard: tier(120, null), cod: { available: false, price: null, transitDays: null, transitLabel: null } },
  } as PincodeInput;
  const r = resolveFromRecord("999998", rec);
  assert(r.options.length === 1 && r.options[0].code === "STANDARD", "999998 only Standard, no COD");
}

// 8 & 9. Neither courier has data -> default Speed Post option (record present but
// not serviceable, AND record missing entirely).
{
  const rNo = resolveFromRecord("792001", {
    serviceable: false,
    dtdc: { serviceable: false, surface: null, air: null, cod: { available: false, price: null, transitDays: null, transitLabel: null } },
    delhivery: { serviceable: false, standard: null, cod: { available: false, price: null, transitDays: null, transitLabel: null } },
  } as PincodeInput);
  console.log("792001 default:", JSON.stringify(rNo));
  assert(rNo.serviceable === true && rNo.options.length === 1, "792001 falls back to one option");
  assert(rNo.options[0].code === "SPEEDPOST" && rNo.options[0].name === "Speed Post", "792001 default is Speed Post");
  assert(rNo.options[0].price === 100 && rNo.options[0].cod === false, "792001 Speed Post = 100, no COD");
  assert(rNo.options[0].transitLabel === "8-10 business days" && rNo.options[0].transitDays === null, "792001 Speed Post label");
  assert(rNo.courier === "SPEEDPOST", "792001 courier = SPEEDPOST");
  assert(rNo.options[0].courier === "SPEEDPOST", "792001 option tagged courier SPEEDPOST");
  assert(toPublicServiceability(rNo).courier === "SPEEDPOST", "792001 public payload includes courier SPEEDPOST");
}
{
  const rNull = resolveFromRecord("123456", null);
  assert(rNull.serviceable === true && rNull.options.length === 1 && rNull.options[0].code === "SPEEDPOST",
    "missing record -> default Speed Post option");
  assert(rNull.options[0].price === 100 && rNull.options[0].cod === false, "missing record Speed Post = 100, no COD");
}

console.log(failures === 0 ? "\nALL ASSERTIONS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
