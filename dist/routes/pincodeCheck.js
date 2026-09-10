"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rateResolver_1 = require("../services/rateResolver");
const router = (0, express_1.Router)();
const PINCODE_RE = /^[1-9][0-9]{5}$/; // 6-digit Indian PIN, doesn't start with 0
// GET /check/400001 - safe to call directly from the storefront (no courier names leak)
router.get("/check/:pincode", async (req, res) => {
    const { pincode } = req.params;
    if (!PINCODE_RE.test(pincode)) {
        return res.status(400).json({ error: "Enter a valid 6-digit PIN code" });
    }
    const resolved = await (0, rateResolver_1.resolveServiceabilityForPincode)(pincode);
    return res.json((0, rateResolver_1.toPublicServiceability)(resolved));
});
exports.default = router;
