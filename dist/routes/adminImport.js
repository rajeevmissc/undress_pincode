"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const pincodeStore_1 = require("../services/pincodeStore");
const phone_1 = require("../services/phone");
const ultramsg_1 = require("../services/ultramsg");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // the workbook is ~2.4 MB
});
function requireAdminKey(req, res, next) {
    const key = req.header("x-admin-key");
    if (!key || key !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}
/**
 * POST /admin/import
 * multipart/form-data, field name "file" = the combined DTDC+Delhivery .xlsx
 * (same file the CLI importer takes). This is a FULL REFRESH of the pincode data.
 */
router.post("/import", requireAdminKey, upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Attach the .xlsx as form field 'file'" });
    }
    try {
        const summary = await (0, pincodeStore_1.importFromBuffer)(req.file.buffer);
        return res.json({ ok: true, ...summary });
    }
    catch (err) {
        console.error("admin import error:", err);
        return res.status(400).json({ error: "Import failed", detail: String(err) });
    }
});
/**
 * POST /admin/test-whatsapp
 * JSON body: { "to": "+91XXXXXXXXXX", "body": "optional custom text" }
 * Sends one WhatsApp message via UltraMsg using this server's own
 * ULTRAMSG_INSTANCE_ID/ULTRAMSG_TOKEN - a quick way to confirm those env vars
 * (and the UltraMsg instance itself) actually work, without needing a real
 * Shopify order or exposing the credentials to whoever is testing.
 */
router.post("/test-whatsapp", requireAdminKey, async (req, res) => {
    const { to, body } = req.body;
    const phone = (0, phone_1.normalizeIndianPhone)(to);
    if (!phone) {
        return res.status(400).json({ error: "Provide a valid Indian phone number as 'to'" });
    }
    try {
        await (0, ultramsg_1.sendWhatsAppMessage)(phone, body || "✅ Test message from your Shopify backend - UltraMsg is wired up correctly.");
        return res.json({ ok: true, sentTo: phone });
    }
    catch (err) {
        console.error("test-whatsapp error:", err);
        return res.status(502).json({ error: "UltraMsg send failed", detail: String(err) });
    }
});
/**
 * GET /admin/env-check
 * Reports which env vars critical to the webhook/WhatsApp flow are actually
 * set on THIS running process, and a few harmless characteristics (length,
 * first/last character) so a copy-paste mistake (stray space, wrong var,
 * truncated paste) can be spotted without ever printing the secret itself.
 */
router.get("/env-check", requireAdminKey, (_req, res) => {
    const describe = (name) => {
        const v = process.env[name];
        if (!v)
            return { set: false };
        return { set: true, length: v.length, startsWith: v.slice(0, 4), endsWith: v.slice(-4) };
    };
    return res.json({
        SHOPIFY_SHOP: describe("SHOPIFY_SHOP"),
        SHOPIFY_ADMIN_ACCESS_TOKEN: describe("SHOPIFY_ADMIN_ACCESS_TOKEN"),
        SHOPIFY_CLIENT_SECRET: describe("SHOPIFY_CLIENT_SECRET"),
        ULTRAMSG_INSTANCE_ID: describe("ULTRAMSG_INSTANCE_ID"),
        ULTRAMSG_TOKEN: describe("ULTRAMSG_TOKEN"),
    });
});
exports.default = router;
