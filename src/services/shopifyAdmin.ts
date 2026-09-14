/**
 * Minimal Shopify Admin REST client for the one write action this app needs
 * to make server-to-server: cancelling an order the customer declined over
 * WhatsApp. Uses the same custom app (SHOPIFY_ADMIN_ACCESS_TOKEN) as the
 * carrier-service registration script - that token needs the `write_orders`
 * scope added (and the app reinstalled) for this to work; see README.
 */

const SHOP = process.env.SHOPIFY_SHOP;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = "2026-07";

export class ShopifyAdminConfigError extends Error {}

function requireConfig(): { shop: string; token: string } {
  if (!SHOP || !TOKEN) {
    throw new ShopifyAdminConfigError("SHOPIFY_SHOP / SHOPIFY_ADMIN_ACCESS_TOKEN are not set");
  }
  return { shop: SHOP, token: TOKEN };
}

async function adminFetch(path: string, init: RequestInit): Promise<Response> {
  const { shop, token } = requireConfig();
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
      ...(init.headers || {}),
    },
  });
  return res;
}

/** Cancels an order because the customer declined it over WhatsApp. */
export async function cancelOrder(orderId: string | number): Promise<void> {
  const res = await adminFetch(`/orders/${orderId}/cancel.json`, {
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
export async function addOrderTag(orderId: string | number, tag: string): Promise<void> {
  const getRes = await adminFetch(`/orders/${orderId}.json?fields=id,tags`, { method: "GET" });
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

  const putRes = await adminFetch(`/orders/${orderId}.json`, {
    method: "PUT",
    body: JSON.stringify({ order: { id: order.id, tags: [...existingTags, tag].join(", ") } }),
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "");
    throw new Error(`Shopify addOrderTag failed: ${putRes.status} ${text}`);
  }
}
