"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_OPTION = void 0;
exports.resolveFromRecord = resolveFromRecord;
exports.resolveServiceabilityForPincode = resolveServiceabilityForPincode;
exports.toPublicServiceability = toPublicServiceability;
const PincodeServiceability_1 = require("../models/PincodeServiceability");
const pincodeDataset_1 = require("./pincodeDataset");
/**
 * Last-resort option used when neither DTDC nor Delhivery has data for a pincode
 * (including a pincode that isn't in the DB at all). Speed Post reaches every
 * Indian PIN, so with this the checkout always has at least one shipping option.
 */
exports.DEFAULT_OPTION = {
    code: "SPEEDPOST",
    name: "Speed Post",
    price: 100,
    transitLabel: "8-10 business days",
};
function daysLabel(days) {
    if (days === null || days === undefined || !Number.isFinite(days))
        return "";
    return days === 1 ? "1 business day" : `${days} business days`;
}
/** Prefer a label stored on the document; fall back to the day count, then to text. */
function transitTextFor(info, fallback) {
    return info?.transitLabel || daysLabel(info?.transitDays) || fallback;
}
/**
 * Pure decision logic - no database.
 *
 *  - If DTDC serves the pincode, the customer is offered ONLY DTDC options:
 *      Standard (Surface, always free), Priority (Air), and COD when DTDC flags it.
 *  - Delhivery is used ONLY when DTDC does not serve the pincode at all. It then
 *    offers a single "Standard" option, plus COD when Delhivery flags it.
 *  - If neither courier has data for the pincode, a single default Speed Post
 *    option (prepaid, no COD) is returned so checkout is never left with nothing.
 *  - The fulfilling partner ("DTDC" | "DELHIVERY" | "SPEEDPOST") is included on
 *    the result and on every option.
 */
function resolveFromRecord(pincode, rec) {
    const options = [];
    let courier = "SPEEDPOST";
    if (rec && rec.serviceable && rec.dtdc?.serviceable) {
        const { dtdc } = rec;
        courier = "DTDC";
        // Standard = DTDC Surface. A null tier means "not offered", never "free".
        if (dtdc.surface?.available) {
            options.push({
                code: "STANDARD",
                name: "Standard Delivery",
                price: dtdc.surface.price,
                transitDays: dtdc.surface.transitDays,
                transitLabel: transitTextFor(dtdc.surface, "Standard delivery"),
                cod: false,
            });
        }
        // Priority = DTDC Air.
        if (dtdc.air?.available) {
            options.push({
                code: "PRIORITY",
                name: "Priority Delivery",
                price: dtdc.air.price,
                transitDays: dtdc.air.transitDays,
                transitLabel: transitTextFor(dtdc.air, "Priority delivery"),
                cod: false,
            });
        }
        // COD rides on the DTDC network; fee already stored as the Air price.
        if (dtdc.cod?.available) {
            const codDays = dtdc.cod.transitDays ?? dtdc.air?.transitDays ?? dtdc.surface?.transitDays ?? null;
            options.push({
                code: "COD",
                name: "Cash on Delivery",
                price: dtdc.cod.price ?? 0,
                transitDays: codDays,
                transitLabel: transitTextFor({ transitDays: codDays, transitLabel: dtdc.cod.transitLabel }, "Pay when your order arrives"),
                cod: true,
            });
        }
    }
    else if (rec && rec.serviceable && rec.delhivery?.serviceable) {
        // ---- Delhivery fallback (DTDC does not serve this pincode) ----
        const { delhivery } = rec;
        courier = "DELHIVERY";
        if (delhivery.standard?.available) {
            options.push({
                code: "STANDARD",
                name: "Standard Delivery",
                price: delhivery.standard.price,
                transitDays: delhivery.standard.transitDays,
                transitLabel: transitTextFor(delhivery.standard, pincodeDataset_1.DELHIVERY_TRANSIT_LABEL),
                cod: false,
            });
        }
        if (delhivery.cod?.available) {
            options.push({
                code: "COD",
                name: "Cash on Delivery",
                price: delhivery.cod.price ?? 0,
                transitDays: delhivery.cod.transitDays,
                transitLabel: transitTextFor(delhivery.cod, pincodeDataset_1.DELHIVERY_TRANSIT_LABEL),
                cod: true,
            });
        }
    }
    // Nothing from either courier (or no record at all) -> default Speed Post option.
    if (options.length === 0) {
        courier = "SPEEDPOST";
        options.push({
            code: exports.DEFAULT_OPTION.code,
            name: exports.DEFAULT_OPTION.name,
            price: exports.DEFAULT_OPTION.price,
            transitDays: null,
            transitLabel: exports.DEFAULT_OPTION.transitLabel,
            cod: false,
        });
    }
    return {
        pincode,
        serviceable: true,
        courier,
        options: options.map((o) => ({ ...o, courier })),
    };
}
/** DB-backed wrapper used by the routes. */
async function resolveServiceabilityForPincode(rawPincode) {
    const pincode = rawPincode.trim();
    const rec = await PincodeServiceability_1.PincodeServiceability.findOne({ pincode }).lean();
    return resolveFromRecord(pincode, rec);
}
/**
 * Shapes the resolver result for the public API. Kept as a seam in case fields
 * ever need to be withheld again; currently a straight passthrough (the store
 * wants the delivery-partner name included).
 */
function toPublicServiceability(r) {
    return r;
}
