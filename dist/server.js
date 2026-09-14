"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const db_1 = require("./db");
const carrierService_1 = __importDefault(require("./routes/carrierService"));
const pincodeCheck_1 = __importDefault(require("./routes/pincodeCheck"));
const adminImport_1 = __importDefault(require("./routes/adminImport"));
const orderWebhook_1 = __importDefault(require("./routes/orderWebhook"));
const whatsappWebhook_1 = __importDefault(require("./routes/whatsappWebhook"));
async function main() {
    await (0, db_1.connectDb)();
    const app = (0, express_1.default)();
    // Shopify signs the orders/create webhook over the exact raw request bytes -
    // this MUST be mounted with a raw body parser, and BEFORE the global
    // express.json() below, or the signature can never verify. Scoped to this
    // exact path (not all of /webhooks) so it doesn't consume the request
    // stream ahead of express.json() for any other route.
    app.use("/webhooks/orders-create", express_1.default.raw({ type: "application/json" }), orderWebhook_1.default);
    app.use(express_1.default.json());
    // Called by UltraMsg when the customer replies on WhatsApp - no signature to
    // verify (UltraMsg doesn't sign webhook deliveries), plain JSON is fine.
    app.use("/webhooks", whatsappWebhook_1.default);
    // Called by Shopify at checkout - must stay fast and public (Shopify calls it server-to-server)
    app.use("/shopify", carrierService_1.default);
    // Called by your storefront theme AND the checkout extension (cross-origin
    // from Shopify's checkout sandbox), so this needs CORS enabled. Only exposes
    // resolved rates, never courier names, so open CORS here is intentional and safe.
    app.use("/", (0, cors_1.default)(), pincodeCheck_1.default);
    // Called by your own admin tooling to load/refresh the two courier CSVs
    app.use("/admin", adminImport_1.default);
    app.get("/health", (_req, res) => res.json({ ok: true }));
    const port = Number(process.env.PORT) || 3000;
    app.listen(port, () => console.log(`Listening on :${port}`));
}
main().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
});
