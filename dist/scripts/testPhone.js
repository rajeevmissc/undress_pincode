"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * npm run test-phone  -  pure logic test of phone normalization and reply
 * intent parsing, no database or network involved.
 */
const phone_1 = require("../services/phone");
let failures = 0;
function assert(cond, msg) {
    if (!cond) {
        console.error(`  ASSERTION FAILED: ${msg}`);
        failures++;
    }
}
// --- normalizeIndianPhone ---
assert((0, phone_1.normalizeIndianPhone)("9876543210") === "919876543210", "bare 10-digit number gets 91 prefix");
assert((0, phone_1.normalizeIndianPhone)("09876543210") === "919876543210", "leading 0 stripped, 91 prefix added");
assert((0, phone_1.normalizeIndianPhone)("+91 98765-43210") === "919876543210", "formatted number with +91 normalizes");
assert((0, phone_1.normalizeIndianPhone)("919876543210") === "919876543210", "already-normalized number passes through");
assert((0, phone_1.normalizeIndianPhone)("919876543210@c.us") === "919876543210", "WhatsApp @c.us suffix stripped");
assert((0, phone_1.normalizeIndianPhone)("911234567890") === null, "landline-shaped number (starts 1-5 after 91) rejected");
assert((0, phone_1.normalizeIndianPhone)("12345") === null, "too short rejected");
assert((0, phone_1.normalizeIndianPhone)(null) === null, "null rejected");
assert((0, phone_1.normalizeIndianPhone)(undefined) === null, "undefined rejected");
assert((0, phone_1.normalizeIndianPhone)("") === null, "empty string rejected");
// --- parseReplyIntent ---
assert((0, phone_1.parseReplyIntent)("CONFIRM") === "confirm", "uppercase CONFIRM");
assert((0, phone_1.parseReplyIntent)("confirm") === "confirm", "lowercase confirm");
assert((0, phone_1.parseReplyIntent)(" Confirm! ") === "confirm", "punctuation/whitespace tolerated");
assert((0, phone_1.parseReplyIntent)("yes") === "confirm", "yes maps to confirm");
assert((0, phone_1.parseReplyIntent)("1") === "confirm", "1 maps to confirm");
assert((0, phone_1.parseReplyIntent)("CANCEL") === "cancel", "uppercase CANCEL");
assert((0, phone_1.parseReplyIntent)("cancel") === "cancel", "lowercase cancel");
assert((0, phone_1.parseReplyIntent)("no") === "cancel", "no maps to cancel");
assert((0, phone_1.parseReplyIntent)("2") === "cancel", "2 maps to cancel");
assert((0, phone_1.parseReplyIntent)("maybe later") === "unrecognized", "unrelated text is unrecognized");
assert((0, phone_1.parseReplyIntent)("") === "unrecognized", "empty string is unrecognized");
assert((0, phone_1.parseReplyIntent)(null) === "unrecognized", "null is unrecognized");
assert((0, phone_1.parseReplyIntent)(undefined) === "unrecognized", "undefined is unrecognized");
console.log(failures === 0 ? "\nALL ASSERTIONS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
