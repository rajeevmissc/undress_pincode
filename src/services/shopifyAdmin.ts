/**
 * Minimal Shopify Admin REST client for the write actions the WhatsApp
 * confirm/cancel flow needs (cancel an order, tag an order). Multi-store
 * aware: this one backend serves several Shopify stores that all share the
 * same custom app (same Client ID/Secret - see shopifyWebhook.ts), but each
 * store's *installation* has its own Admin API access token.
 *
 * Token lookup, in order:
 *  1. SHOPIFY_ADMIN_TOKENS - a JSON object mapping shop domain -> token,
 *     e.g. {"store-a.myshopify.com":"shpat_aaa","store-b.myshopify.com":"shpat_bbb"}.
 *     Use this once more than one store is wired up.
 *  2. SHOPIFY_SHOP / SHOPIFY_ADMIN_ACCESS_TOKEN - the original single-store
 *     pair, kept as a fallback so existing single-store setups need no
 *     env var changes.
 */

const API_VERSION = "2026-07";

export class ShopifyAdminConfigError extends Error {}

function parseTokenMap(): Record<string, string> {
  const raw = process.env.SHOPIFY_ADMIN_TOKENS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    console.error("SHOPIFY_ADMIN_TOKENS is set but is not valid JSON - ignoring it");
    return {};
  }
}

export function resolveToken(shop: string): string {
  const map = parseTokenMap();
  if (map[shop]) return map[shop];

  // Single-store fallback - only valid for the one shop these legacy env
  // vars were set up for.
  if (shop === process.env.SHOPIFY_SHOP && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  }

  throw new ShopifyAdminConfigError(
    `No Admin API token configured for shop "${shop}" - add it to SHOPIFY_ADMIN_TOKENS`
  );
}

async function adminFetch(shop: string, path: string, init: RequestInit): Promise<Response> {
  const token = resolveToken(shop);
  return fetch(`https://${shop}/admin/api/${API_VERSION}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
      ...(init.headers || {}),
    },
  });
}

/** Cancels an order because the customer declined it over WhatsApp. */
export async function cancelOrder(shop: string, orderId: string | number): Promise<void> {
  const res = await adminFetch(shop, `/orders/${orderId}/cancel.json`, {
    method: "POST",
    body: JSON.stringify({
      reason: "customer",
      email: false, // we already told the customer via WhatsApp - no need for Shopify's own cancellation email
      restock: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shopify cancelOrder failed: ${res.status} ${text}`);
  }
}

/** Appends a tag to an order (e.g. "WhatsApp Confirmed") without clobbering existing tags. */
export async function addOrderTag(shop: string, orderId: string | number, tag: string): Promise<void> {
  const getRes = await adminFetch(shop, `/orders/${orderId}.json?fields=id,tags`, { method: "GET" });
  if (!getRes.ok) {
    const text = await getRes.text().catch(() => "");
    throw new Error(`Shopify getOrder failed: ${getRes.status} ${text}`);
  }
  const { order } = (await getRes.json()) as { order: { id: number; tags: string } };
  const existingTags = (order.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (existingTags.includes(tag)) return; // already tagged, nothing to do

  const putRes = await adminFetch(shop, `/orders/${orderId}.json`, {
    method: "PUT",
    body: JSON.stringify({ order: { id: order.id, tags: [...existingTags, tag].join(", ") } }),
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "");
    throw new Error(`Shopify addOrderTag failed: ${putRes.status} ${text}`);
  }
}
