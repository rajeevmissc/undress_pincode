"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rateResolver_1 = require("../services/rateResolver");
const router = (0, express_1.Router)();
function addBusinessDays(from, days) {
    const d = new Date(from);
    let added = 0;
    while (added < days) {
        d.setDate(d.getDate() + 1);
        const day = d.getDay();
        if (day !== 0 && day !== 6)
            added++;
    }
    return d;
}
router.post("/rates", async (req, res) => {
    try {
        const body = req.body;
        const zip = body?.rate?.destination?.postal_code || body?.rate?.destination?.zip;
        if (!zip) {
            // No postal code yet (e.g. mid-address-entry) - return no rates rather than error
            return res.json({ rates: [] });
        }
        const resolved = await (0, rateResolver_1.resolveServiceabilityForPincode)(zip);
        const now = new Date();
        const rates = resolved.options.map((opt) => {
            // Spell out the COD handling fee in the description so the shopper sees
            // why this option costs more than the equivalent prepaid one, instead of
            // just a bare total.
            // const description = opt.codFee
            //     ? `${opt.transitLabel} (includes ₹${opt.codFee} COD handling fee)`
            //     : opt.transitLabel;
            const hasDateEstimate = !!(opt.transitDays && opt.transitDays > 0);
            const feeNote = opt.codFee ? `+ ₹${opt.codFee} COD handling fee added` : null;
            const description = hasDateEstimate
                ? feeNote ?? undefined
                : [opt.transitLabel, feeNote].filter(Boolean).join(" · ");
            const rate = {
                service_name: opt.name,
                service_code: opt.code,
                total_price: String(Math.round(opt.price * 100)),
                currency: "INR",
                description,
                courier: opt.courier,
            };
            if (hasDateEstimate) {
                rate.min_delivery_date = now.toISOString();
                rate.max_delivery_date = addBusinessDays(now, opt.transitDays).toISOString();
            }
            return rate;
        });
        // Empty array (not an error) is how you tell Shopify "we have no rates for this address"
        return res.json(rates.length ? { rates, courier: resolved.courier } : { rates });
    }
    catch (err) {
        console.error("carrier-service /rates error:", err);
        // A 5xx here makes Shopify fall back to any other configured rate provider
        // instead of showing a broken checkout - safer than a 200 with bad data.
        return res.status(500).json({ rates: [] });
    }
});
exports.default = router;




