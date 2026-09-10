export interface CheckPincodeResponse {
  pincode: string;
  serviceable: boolean;
  cod?: { available: boolean; price?: number };
}

/**
 * Given the /check/:pincode response, what should the cod_eligible cart
 * attribute be set to? Kept as a pure string-in-string-out function so it's
 * testable without mocking any Shopify hooks or DOM.
 */
export function deriveCodEligibleValue(response: CheckPincodeResponse | null): "true" | "false" {
  if (!response) return "false"; // fetch failed or pincode invalid - fail closed
  if (!response.serviceable) return "false";
  if (!response.cod?.available) return "false";
  return "true";
}

/** Very light validation - full validation happens server-side too. */
export function looksLikeCompletePincode(zip: string | undefined | null): zip is string {
  return !!zip && /^[1-9][0-9]{5}$/.test(zip.trim());
}
