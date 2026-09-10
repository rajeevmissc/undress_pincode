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
async function main() {
    await (0, db_1.connectDb)();
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
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
