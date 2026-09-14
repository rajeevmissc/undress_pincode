"use strict";
/**
 * Thin client for UltraMsg's WhatsApp gateway (https://docs.ultramsg.com/).
 *
 * UltraMsg is a WhatsApp-Web-automation gateway, not the official Meta
 * WhatsApp Business Cloud API - it can only send plain text/media messages,
 * not real interactive buttons/lists. Confirm/cancel here is done by asking
 * the customer to reply with a word, not by rendering tappable buttons.
 */
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
/** The order-confirmation prompt sent right after a COD order is placed. */
function buildOrderConfirmationMessage(opts) {
    const { customerName, orderName, amount, currency } = opts;
    return (`🛍️ *Order Confirmation*\n\n` +
        `Hi ${customerName},\n` +
        `Your COD order ${orderName} for ${currency} ${amount} has been placed successfully.\n\n` +
        `Please reply *CONFIRM* to confirm this order, or *CANCEL* to cancel it.`);
}
function buildConfirmedReply(orderName) {
    return `✅ Thanks! Your order ${orderName} is confirmed and will be shipped soon.`;
}
function buildCancelledReply(orderName) {
    return `❌ Your order ${orderName} has been cancelled as requested.`;
}
function buildUnrecognizedReply(orderName) {
    return `Sorry, I didn't understand that. For order ${orderName}, please reply *CONFIRM* or *CANCEL*.`;
}
