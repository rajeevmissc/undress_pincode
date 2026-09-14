"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const shopifyWebhook_1 = require("../services/shopifyWebhook");
const phone_1 = require("../services/phone");
const ultramsg_1 = require("../services/ultramsg");
const OrderConfirmation_1 = require("../models/OrderConfirmation");
const router = (0, express_1.Router)();
/** One readable line, e.g. "12 MG Road, Apt 4, Bengaluru, Karnataka 560001". */
function formatAddress(addr) {
    if (!addr)
        return null;
    const line1 = [addr.address1, addr.address2].filter(Boolean).join(", ");
    const cityState = [addr.city, addr.province].filter(Boolean).join(", ");
    const parts = [line1, [cityState, addr.zip].filter(Boolean).join(" ")].filter(Boolean);
    return parts.length ? parts.join(", ") : null;
}
function isCodOrder(payload) {
    return (payload.payment_gateway_names || []).some((name) => name.toLowerCase().includes("cash on delivery"));
}
function pickPhone(payload) {
    return (payload.shipping_address?.phone ||
        payload.customer?.phone ||
        payload.billing_address?.phone ||
        payload.phone ||
        null);
}
function pickCustomerName(payload) {
    return (payload.shipping_address?.first_name ||
        payload.customer?.first_name ||
        payload.billing_address?.first_name ||
        "there");
}
function pickLineItems(payload) {
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
router.post("/", async (req, res) => {
    try {
        const rawBody = req.body;
        const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
        const hmacOk = (0, shopifyWebhook_1.verifyShopifyWebhook)(rawBody, hmacHeader);
        if (!hmacOk) {
            // Never log the secret or the digests themselves - just enough shape
            // to tell "env var missing" apart from "env var wrong" apart from
            // "body not raw" without exposing anything sensitive.
            console.warn(`orders/create webhook: invalid HMAC, rejecting ` +
                `(secretConfigured=${!!process.env.SHOPIFY_CLIENT_SECRET}, ` +
                `headerPresent=${!!hmacHeader}, bodyIsBuffer=${Buffer.isBuffer(rawBody)}, bodyBytes=${rawBody?.length ?? "n/a"})`);
            return res.status(401).send("invalid signature");
        }
        const payload = JSON.parse(rawBody.toString("utf8"));
        const shop = req.get("X-Shopify-Shop-Domain");
        if (!shop) {
            console.warn(`orders/create webhook: order ${payload.name} has no X-Shopify-Shop-Domain header, skipping`);
            return res.status(200).json({ skipped: "no-shop-header" });
        }
        if (!isCodOrder(payload)) {
            // Not a COD order - nothing for the WhatsApp flow to do. Still 200 so
            // Shopify doesn't retry a webhook we intentionally ignore.
            return res.status(200).json({ skipped: "not-cod" });
        }
        const phone = (0, phone_1.normalizeIndianPhone)(pickPhone(payload));
        if (!phone) {
            console.warn(`orders/create webhook: order ${payload.name} has no usable phone number, skipping WhatsApp`);
            return res.status(200).json({ skipped: "no-phone" });
        }
        const customerName = pickCustomerName(payload);
        const items = pickLineItems(payload);
        const orderStatusUrl = payload.order_status_url || null;
        const address = formatAddress(payload.shipping_address || payload.billing_address);
        await OrderConfirmation_1.OrderConfirmation.create({
            shop,
            shopifyOrderId: String(payload.id),
            orderName: payload.name,
            phone,
            amount: payload.total_price,
            currency: payload.currency,
            customerName,
            items,
            orderStatusUrl,
            address,
            status: "pending",
        });
        const message = (0, ultramsg_1.buildOrderConfirmationMessage)({
            customerName,
            orderName: payload.name,
            amount: payload.total_price,
            currency: payload.currency,
            items,
            orderStatusUrl,
            address,
            phone,
        });
        await (0, ultramsg_1.sendWhatsAppMessage)(phone, message);
        return res.status(200).json({ ok: true });
    }
    catch (err) {
        // Duplicate key (order webhook redelivered by Shopify) is expected and
        // harmless - the first delivery already sent the WhatsApp message.
        if (err && typeof err === "object" && "code" in err && err.code === 11000) {
            return res.status(200).json({ skipped: "duplicate" });
        }
        console.error("orders/create webhook error:", err);
        // 500 makes Shopify retry the delivery - appropriate for a transient
        // failure (DB/UltraMsg down), unlike a deliberate `skipped` response above.
        return res.status(500).json({ error: "internal error" });
    }
});
exports.default = router;
