"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UltraMsgConfigError = void 0;
exports.sendWhatsAppMessage = sendWhatsAppMessage;
exports.buildOrderConfirmationMessage = buildOrderConfirmationMessage;
exports.buildConfirmedReply = buildConfirmedReply;
exports.buildCancelledReply = buildCancelledReply;
exports.buildUnrecognizedReply = buildUnrecognizedReply;
const INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const TOKEN = process.env.ULTRAMSG_TOKEN;
class UltraMsgConfigError extends Error {
}
exports.UltraMsgConfigError = UltraMsgConfigError;
function requireConfig() {
    if (!INSTANCE_ID || !TOKEN) {
        throw new UltraMsgConfigError("ULTRAMSG_INSTANCE_ID / ULTRAMSG_TOKEN are not set");
    }
    return { instanceId: INSTANCE_ID, token: TOKEN };
}
/**
 * Sends a plain-text WhatsApp message.
 * @param to Normalized phone number, digits only with country code (e.g. "919876543210") - no "@c.us" suffix, no "+".
 */
async function sendWhatsAppMessage(to, body) {
    const { instanceId, token } = requireConfig();
    const res = await fetch(`https://api.ultramsg.com/${instanceId}/messages/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, to, body }).toString(),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`UltraMsg send failed: ${res.status} ${text}`);
    }
}
// ---- Brand template pieces (kept in one place so every message stays consistent) ----
const BRAND_NAME = "UNDRESS";
const BRAND_DIVIDER = "──────────────────";
const BRAND_FOOTER = `${BRAND_DIVIDER}\n*${BRAND_NAME}*\n_Made by a woman. Approved by women._\n_Built for you._`;
const CURRENCY_SYMBOLS = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
function money(currency, amount) {
    const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
    const n = Number(amount);
    // Whole-rupee amounts read cleaner without ".00"; keep decimals otherwise.
    const formatted = Number.isFinite(n) && Number.isInteger(n) ? String(n) : amount;
    return `${symbol}${formatted}`;
}
function formatItemsList(items, currency) {
    if (!items.length)
        return "";
    return items
        .map((item) => `• ${item.title} × ${item.quantity} — ${money(currency, item.price)}`)
        .join("\n");
}
function trackingLine(orderStatusUrl) {
    return orderStatusUrl ? `🔗 Track your order: ${orderStatusUrl}\n\n` : "";
}
/** The order-confirmation prompt sent right after a COD order is placed. */
function buildOrderConfirmationMessage(opts) {
    const { customerName, orderName, amount, currency, items, orderStatusUrl, address, phone } = opts;
    const itemsBlock = formatItemsList(items, currency);
    return (`🛍️ *${BRAND_NAME}*\n` +
        `${BRAND_DIVIDER}\n\n` +
        `Hi ${customerName},\n\n` +
        `Your order *${orderName}* has been placed successfully! 🎉\n\n` +
        (itemsBlock ? `📦 *Order Summary*\n${itemsBlock}\n\n` : "") +
        `💰 *Total: ${money(currency, amount)}* _(Cash on Delivery)_\n\n` +
        (address ? `📍 *Delivery Address*\n${address}\n\n` : "") +
        (phone ? `📞 *Contact:* +${phone}\n\n` : "") +
        trackingLine(orderStatusUrl) +
        `Please confirm this order so we can get it packed and shipped:\n\n` +
        `✅ Reply *CONFIRM* to confirm\n` +
        `❌ Reply *CANCEL* to cancel\n\n` +
        BRAND_FOOTER);
}
function buildConfirmedReply(orderName, orderStatusUrl) {
    return (`✅ *Order Confirmed — ${orderName}*\n\n` +
        `Thank you for confirming! Your order is now being prepared and will be shipped soon. 📦\n\n` +
        trackingLine(orderStatusUrl) +
        BRAND_FOOTER);
}
function buildCancelledReply(orderName, orderStatusUrl) {
    return (`❌ *Order Cancelled — ${orderName}*\n\n` +
        `Your order has been cancelled as requested. If this was a mistake, feel free to place a new order anytime. 💛\n\n` +
        trackingLine(orderStatusUrl) +
        BRAND_FOOTER);
}
function buildUnrecognizedReply(orderName) {
    return (`Hi, we didn't quite catch that 🤔\n\n` +
        `For order *${orderName}*, please reply:\n` +
        `✅ *CONFIRM* to confirm\n` +
        `❌ *CANCEL* to cancel\n\n` +
        BRAND_FOOTER);
}
