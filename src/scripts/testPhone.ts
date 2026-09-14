/**
 * npm run test-phone  -  pure logic test of phone normalization and reply
 * intent parsing, no database or network involved.
 */
import { normalizeIndianPhone, parseReplyIntent } from "../services/phone";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  ASSERTION FAILED: ${msg}`);
    failures++;
  }
}

// --- normalizeIndianPhone ---
assert(normalizeIndianPhone("9876543210") === "919876543210", "bare 10-digit number gets 91 prefix");
assert(normalizeIndianPhone("09876543210") === "919876543210", "leading 0 stripped, 91 prefix added");
assert(normalizeIndianPhone("+91 98765-43210") === "919876543210", "formatted number with +91 normalizes");
assert(normalizeIndianPhone("919876543210") === "919876543210", "already-normalized number passes through");
assert(normalizeIndianPhone("919876543210@c.us") === "919876543210", "WhatsApp @c.us suffix stripped");
assert(normalizeIndianPhone("911234567890") === null, "landline-shaped number (starts 1-5 after 91) rejected");
assert(normalizeIndianPhone("12345") === null, "too short rejected");
assert(normalizeIndianPhone(null) === null, "null rejected");
assert(normalizeIndianPhone(undefined) === null, "undefined rejected");
assert(normalizeIndianPhone("") === null, "empty string rejected");

// --- parseReplyIntent ---
assert(parseReplyIntent("CONFIRM") === "confirm", "uppercase CONFIRM");
assert(parseReplyIntent("confirm") === "confirm", "lowercase confirm");
assert(parseReplyIntent(" Confirm! ") === "confirm", "punctuation/whitespace tolerated");
assert(parseReplyIntent("yes") === "confirm", "yes maps to confirm");
assert(parseReplyIntent("1") === "confirm", "1 maps to confirm");
assert(parseReplyIntent("CANCEL") === "cancel", "uppercase CANCEL");
assert(parseReplyIntent("cancel") === "cancel", "lowercase cancel");
assert(parseReplyIntent("no") === "cancel", "no maps to cancel");
assert(parseReplyIntent("2") === "cancel", "2 maps to cancel");
assert(parseReplyIntent("maybe later") === "unrecognized", "unrelated text is unrecognized");
assert(parseReplyIntent("") === "unrecognized", "empty string is unrecognized");
assert(parseReplyIntent(null) === "unrecognized", "null is unrecognized");
assert(parseReplyIntent(undefined) === "unrecognized", "undefined is unrecognized");

console.log(failures === 0 ? "\nALL ASSERTIONS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
