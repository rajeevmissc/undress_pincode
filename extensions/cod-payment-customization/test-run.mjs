// node test-run.mjs
import { run } from "./src/run.js";

const paymentMethods = [
  { id: "gid://shopify/PaymentCustomizationPaymentMethod/0", name: "Shopify Payments" },
  { id: "gid://shopify/PaymentCustomizationPaymentMethod/1", name: "UPI" },
  { id: "gid://shopify/PaymentCustomizationPaymentMethod/2", name: "Cash on Delivery (COD)" },
];

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`ASSERTION FAILED: ${msg}`);
    failures++;
  } else {
    console.log(`ok - ${msg}`);
  }
}

// Case 1: cod_eligible = "true" -> no operations, COD stays visible
const r1 = run({ cart: { attribute: { value: "true" } }, paymentMethods });
assert(r1.operations.length === 0, "COD-eligible pincode: no hide operation");

// Case 2: cod_eligible = "false" -> hides the COD method by id
const r2 = run({ cart: { attribute: { value: "false" } }, paymentMethods });
assert(r2.operations.length === 1, "COD-ineligible pincode: exactly one operation");
assert(
  r2.operations[0]?.hide?.paymentMethodId === "gid://shopify/PaymentCustomizationPaymentMethod/2",
  "hides the correct payment method id"
);

// Case 3: attribute missing entirely (customer never checked their pincode) -> fails closed, hides COD
const r3 = run({ cart: { attribute: null }, paymentMethods });
assert(r3.operations.length === 1, "missing attribute fails closed and hides COD");

// Case 4: store has no COD payment method configured at all -> no-op, doesn't throw
const r4 = run({
  cart: { attribute: { value: "false" } },
  paymentMethods: paymentMethods.filter((m) => !m.name.includes("Cash on Delivery")),
});
assert(r4.operations.length === 0, "no COD method configured: no-op, no crash");

console.log(failures === 0 ? "\nALL ASSERTIONS PASSED" : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
