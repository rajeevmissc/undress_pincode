import { deriveCodEligibleValue, looksLikeCompletePincode } from "./logic";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`ASSERTION FAILED: ${msg}`);
    failures++;
  } else {
    console.log(`ok - ${msg}`);
  }
}

assert(
  deriveCodEligibleValue({ pincode: "110001", serviceable: true, cod: { available: true, price: 40 } }) === "true",
  "serviceable + COD available -> true"
);
assert(
  deriveCodEligibleValue({ pincode: "682001", serviceable: true, cod: { available: false } }) === "false",
  "serviceable but no COD -> false"
);
assert(
  deriveCodEligibleValue({ pincode: "792001", serviceable: false }) === "false",
  "not serviceable at all -> false"
);
assert(deriveCodEligibleValue(null) === "false", "fetch failed / no response -> false (fail closed)");

assert(looksLikeCompletePincode("110001") === true, "valid 6-digit pincode passes");
assert(looksLikeCompletePincode("1100") === false, "incomplete pincode rejected (still typing)");
assert(looksLikeCompletePincode("0100001") === false, "pincode starting with 0 rejected");
assert(looksLikeCompletePincode(undefined) === false, "undefined zip rejected");
assert(looksLikeCompletePincode("") === false, "empty zip rejected");

console.log(failures === 0 ? "\nALL ASSERTIONS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
