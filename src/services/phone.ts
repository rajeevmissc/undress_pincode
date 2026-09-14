/**
 * Normalizes a phone number to bare digits with an Indian country code
 * (e.g. "919876543210"), so numbers coming from very different sources -
 * Shopify's `shipping_address.phone` / `customer.phone` (often
 * "+91 98765-43210", "09876543210", or "9876543210") and UltraMsg's
 * `data.from` ("919876543210@c.us") - can be compared for equality.
 *
 * India-only for now (this store ships domestically). Returns null when the
 * input doesn't look like a plausible Indian mobile number, so callers can
 * fail closed rather than silently matching the wrong customer.
 */
export function normalizeIndianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // UltraMsg's webhook `from` field is "<digits>@c.us" (or "@g.us" for groups,
  // never relevant here) - strip the WhatsApp suffix before anything else.
  const withoutSuffix = raw.split("@")[0];
  let digits = withoutSuffix.replace(/\D/g, "");

  if (digits.length === 10) {
    digits = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = `91${digits.slice(1)}`;
  }

  // A normalized Indian mobile number is 12 digits: "91" + a 10-digit number
  // starting 6-9.
  if (!/^91[6-9]\d{9}$/.test(digits)) return null;

  return digits;
}

export type ReplyIntent = "confirm" | "cancel" | "unrecognized";

/**
 * Reads the customer's free-text WhatsApp reply and decides which of the two
 * requested actions (if either) it maps to. Deliberately liberal about
 * casing/whitespace/punctuation - "Confirm", "CONFIRM!", " confirm " should
 * all work - but does not guess on genuinely ambiguous text.
 */
export function parseReplyIntent(body: string | null | undefined): ReplyIntent {
  if (!body) return "unrecognized";
  const normalized = body.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

  if (["confirm", "yes", "y", "1"].includes(normalized)) return "confirm";
  if (["cancel", "no", "n", "2"].includes(normalized)) return "cancel";
  return "unrecognized";
}
