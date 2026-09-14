import { Router, Request, Response } from "express";
import { verifyShopifyWebhook } from "../services/shopifyWebhook";
import { normalizeIndianPhone } from "../services/phone";
import { sendWhatsAppMessage, buildOrderConfirmationMessage } from "../services/ultramsg";
import { OrderConfirmation, OrderConfirmationLineItem } from "../models/OrderConfirmation";

const router = Router();

// Minimal subset of Shopify's orders/create webhook payload actually used here.
interface ShopifyOrderWebhookPayload {
  id: number;
  name: string; // e.g. "#1001"
  total_price: string;
  currency: string;
  payment_gateway_names?: string[];
  phone?: string | null;
  customer?: { first_name?: string; phone?: string | null } | null;
  shipping_address?: { first_name?: string; phone?: string | null } | null;
  billing_address?: { first_name?: string; phone?: string | null } | null;
  line_items?: { title: string; quantity: number; price: string }[];
  order_status_url?: string | null; // Shopify's own per-order, per-customer tracking page
}

function isCodOrder(payload: ShopifyOrderWebhookPayload): boolean {
  return (payload.payment_gateway_names || []).some((name) =>
    name.toLowerCase().includes("cash on delivery")
  );
}

function pickPhone(payload: ShopifyOrderWebhookPayload): string | null {
  return (
    payload.shipping_address?.phone ||
    payload.customer?.phone ||
    payload.billing_address?.phone ||
    payload.phone ||
    null
  );
}

function pickCustomerName(payload: ShopifyOrderWebhookPayload): string {
  return (
    payload.shipping_address?.first_name ||
    payload.customer?.first_name ||
    payload.billing_address?.first_name ||
    "there"
  );
}

function pickLineItems(payload: ShopifyOrderWebhookPayload): OrderConfirmationLineItem[] {
  return (payload.line_items || []).map((li) => ({
    title: li.title,
    quantity: li.quantity,
    price: li.price,
  }));
}

// Mounted at exactly "/webhooks/orders-create" in server.ts (with a raw body
// parser ahead of it) - the route path here is just "/", not "/orders-create".
// HMAC verification runs against the exact bytes Shopify sent, before any
// JSON parsing.
router.post("/", async (req: Request, res: Response) => {
  try {
    const rawBody = req.body as Buffer;
    const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
    const hmacOk = verifyShopifyWebhook(rawBody, hmacHeader);
    if (!hmacOk) {
      // Never log the secret or the digests themselves - just enough shape
      // to tell "env var missing" apart from "env var wrong" apart from
      // "body not raw" without exposing anything sensitive.
      console.warn(
        `orders/create webhook: invalid HMAC, rejecting ` +
          `(secretConfigured=${!!process.env.SHOPIFY_CLIENT_SECRET}, ` +
          `headerPresent=${!!hmacHeader}, bodyIsBuffer=${Buffer.isBuffer(rawBody)}, bodyBytes=${rawBody?.length ?? "n/a"})`
      );
      return res.status(401).send("invalid signature");
    }

    const payload = JSON.parse(rawBody.toString("utf8")) as ShopifyOrderWebhookPayload;

    if (!isCodOrder(payload)) {
      // Not a COD order - nothing for the WhatsApp flow to do. Still 200 so
      // Shopify doesn't retry a webhook we intentionally ignore.
      return res.status(200).json({ skipped: "not-cod" });
    }

    const phone = normalizeIndianPhone(pickPhone(payload));
    if (!phone) {
      console.warn(`orders/create webhook: order ${payload.name} has no usable phone number, skipping WhatsApp`);
      return res.status(200).json({ skipped: "no-phone" });
    }

    const customerName = pickCustomerName(payload);
    const items = pickLineItems(payload);
    const orderStatusUrl = payload.order_status_url || null;

    await OrderConfirmation.create({
      shopifyOrderId: String(payload.id),
      orderName: payload.name,
      phone,
      amount: payload.total_price,
      currency: payload.currency,
      customerName,
      items,
      orderStatusUrl,
      status: "pending",
    });

    const message = buildOrderConfirmationMessage({
      customerName,
      orderName: payload.name,
      amount: payload.total_price,
      currency: payload.currency,
      items,
      orderStatusUrl,
    });
    await sendWhatsAppMessage(phone, message);

    return res.status(200).json({ ok: true });
  } catch (err) {
    // Duplicate key (order webhook redelivered by Shopify) is expected and
    // harmless - the first delivery already sent the WhatsApp message.
    if (err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === 11000) {
      return res.status(200).json({ skipped: "duplicate" });
    }
    console.error("orders/create webhook error:", err);
    // 500 makes Shopify retry the delivery - appropriate for a transient
    // failure (DB/UltraMsg down), unlike a deliberate `skipped` response above.
    return res.status(500).json({ error: "internal error" });
  }
});

export default router;
