"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const pincodeStore_1 = require("../services/pincodeStore");
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
exports.default = router;
