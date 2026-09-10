// @ts-check

/**
 * Reads the "cod_eligible" cart attribute (set by a companion checkout extension -
 * see README) and hides any payment method whose name contains "Cash on Delivery"
 * unless that attribute is exactly the string "true".
 *
 * Fails closed on purpose: if the attribute is missing or unset, COD is hidden.
 * A pincode that was never actually checked should not silently offer COD.
 *
 * @param {{
 *   cart: { attribute: { value: string } | null },
 *   paymentMethods: { id: string, name: string }[]
 * }} input
 * @returns {{ operations: { hide: { paymentMethodId: string } }[] }}
 */
export function run(input) {
  const noChanges = { operations: [] };

  const codEligible = input.cart.attribute?.value === "true";
  if (codEligible) {
    return noChanges;
  }

  const codMethod = input.paymentMethods.find((m) =>
    m.name.toLowerCase().includes("cash on delivery")
  );

  if (!codMethod) {
    // No COD payment method configured on this store at all - nothing to hide
    return noChanges;
  }

  return {
    operations: [
      {
        hide: {
          paymentMethodId: codMethod.id,
        },
      },
    ],
  };
}
