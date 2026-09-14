"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyShopifyWebhook = verifyShopifyWebhook;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Verifies the `X-Shopify-Hmac-Sha256` header Shopify puts on every webhook
 * delivery, using the app's client secret (the same secret used for the
 * client_credentials OAuth grant - see README). Must run against the RAW
 * request body bytes, before any JSON parsing/re-serialization, or the
 * signature will never match.
 */
function verifyShopifyWebhook(rawBody, hmacHeader) {
    const secret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!secret || !hmacHeader)
        return false;
    const digest = crypto_1.default.createHmac("sha256", secret).update(rawBody).digest("base64");
    // Lengths usually match (both base64 SHA-256 digests) but timingSafeEqual
    // throws on mismatched lengths rather than returning false - guard first.
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(hmacHeader, "utf8");
    if (a.length !== b.length)
        return false;
    return crypto_1.default.timingSafeEqual(a, b);
}
