// "use strict";
// Object.defineProperty(exports, "__esModule", { value: true });
// exports.COD_HANDLING_FEE = exports.DEFAULT_OPTION = void 0;
// exports.resolveFromRecord = resolveFromRecord;
// exports.resolveServiceabilityForPincode = resolveServiceabilityForPincode;
// exports.toPublicServiceability = toPublicServiceability;
// const PincodeServiceability_1 = require("../models/PincodeServiceability");
// const pincodeDataset_1 = require("./pincodeDataset");
// /**
//  * Last-resort option used when neither DTDC nor Delhivery has data for a pincode
//  * (including a pincode that isn't in the DB at all). Speed Post reaches every
//  * Indian PIN, so with this the checkout always has at least one shipping option.
//  */
// exports.DEFAULT_OPTION = {
//     code: "SPEEDPOST",
//     name: "Speed Post",
//     price: 100,
//     transitLabel: "8-10 business days",
// };
// /**
//  * Flat handling fee added on top of every COD option's price, regardless of
//  * which courier is fulfilling it or how that base price was computed. Applied
//  * once, centrally, in resolveFromRecord below - never add it at an individual
//  * option's construction site.
//  */
// exports.COD_HANDLING_FEE = 25;
// function daysLabel(days) {
//     if (days === null || days === undefined || !Number.isFinite(days))
//         return "";
//     return days === 1 ? "1 business day" : `${days} business days`;
// }
// /** Prefer a label stored on the document; fall back to the day count, then to text. */
// function transitTextFor(info, fallback) {
//     return info?.transitLabel || daysLabel(info?.transitDays) || fallback;
// }
// /**
//  * Pure decision logic - no database.
//  *
//  *  - If DTDC serves the pincode, the customer is offered DTDC options:
//  *      Standard (Surface, always free), Priority (Air), and COD when DTDC flags it.
//  *    If DTDC serves the pincode but has no COD of its own, Delhivery's COD option
//  *    is borrowed (tagged courier "DELHIVERY") when Delhivery flags COD there.
//  *  - Delhivery is otherwise used only when DTDC does not serve the pincode at all.
//  *    It then offers a single "Standard" option, plus COD when Delhivery flags it.
//  *  - If neither courier has data for the pincode, a single default Speed Post
//  *    option (prepaid, no COD) is returned so checkout is never left with nothing.
//  *  - The fulfilling partner ("DTDC" | "DELHIVERY" | "SPEEDPOST") is included on
//  *    the result and on every option.
//  */
// function resolveFromRecord(pincode, rec) {
//     // Options normally inherit the pincode's single fulfilling courier. A row may
//     // carry its own `courier` to override that (used for the DTDC->Delhivery COD
//     // fallback below).
//     const options = [];
//     let courier = "SPEEDPOST";
//     if (rec && rec.serviceable && rec.dtdc?.serviceable) {
//         const { dtdc } = rec;
//         courier = "DTDC";
//         // Standard = DTDC Surface. A null tier means "not offered", never "free".
//         if (dtdc.surface?.available) {
//             options.push({
//                 code: "STANDARD",
//                 name: "Standard Delivery",
//                 price: dtdc.surface.price,
//                 transitDays: dtdc.surface.transitDays,
//                 transitLabel: transitTextFor(dtdc.surface, "Standard delivery"),
//                 cod: false,
//             });
//         }
//         // Priority = DTDC Air.
//         if (dtdc.air?.available) {
//             options.push({
//                 code: "PRIORITY",
//                 name: "Priority Delivery",
//                 price: dtdc.air.price,
//                 transitDays: dtdc.air.transitDays,
//                 transitLabel: transitTextFor(dtdc.air, "Priority delivery"),
//                 cod: false,
//             });
//         }
//         // COD rides on the DTDC network; fee already stored as the Air price.
//         if (dtdc.cod?.available) {
//             const codDays = dtdc.cod.transitDays ?? dtdc.air?.transitDays ?? dtdc.surface?.transitDays ?? null;
//             options.push({
//                 code: "COD",
//                 name: "Cash on Delivery",
//                 price: dtdc.cod.price ?? 0,
//                 transitDays: codDays,
//                 transitLabel: transitTextFor({ transitDays: codDays, transitLabel: dtdc.cod.transitLabel }, "Pay when your order arrives"),
//                 cod: true,
//             });
//         }
//         else if (rec.delhivery?.cod?.available) {
//             // DTDC serves this pincode but offers no COD - borrow Delhivery's COD so the
//             // customer still gets a pay-on-delivery option. Price = Delhivery's own
//             // Standard price (120, or 150 for North East) - same convention as DTDC
//             // COD riding on its Air price above - NOT the small zone COD handling fee.
//             // This row is fulfilled by Delhivery, so it carries its own courier tag.
//             const delCod = rec.delhivery.cod;
//             const delStandard = rec.delhivery.standard;
//             options.push({
//                 code: "COD",
//                 name: "Cash on Delivery",
//                 price: delStandard?.price ?? delCod.price ?? 0,
//                 transitDays: delStandard?.transitDays ?? delCod.transitDays,
//                 transitLabel: transitTextFor(delStandard ?? delCod, pincodeDataset_1.DELHIVERY_TRANSIT_LABEL),
//                 cod: true,
//                 courier: "DELHIVERY",
//             });
//         }
//     }
//     else if (rec && rec.serviceable && rec.delhivery?.serviceable) {
//         // ---- Delhivery fallback (DTDC does not serve this pincode) ----
//         const { delhivery } = rec;
//         courier = "DELHIVERY";
//         if (delhivery.standard?.available) {
//             options.push({
//                 code: "STANDARD",
//                 name: "Standard Delivery",
//                 price: delhivery.standard.price,
//                 transitDays: delhivery.standard.transitDays,
//                 transitLabel: transitTextFor(delhivery.standard, pincodeDataset_1.DELHIVERY_TRANSIT_LABEL),
//                 cod: false,
//             });
//         }
//         if (delhivery.cod?.available) {
//             options.push({
//                 code: "COD",
//                 name: "Cash on Delivery",
//                 price: delhivery.cod.price ?? 0,
//                 transitDays: delhivery.cod.transitDays,
//                 transitLabel: transitTextFor(delhivery.cod, pincodeDataset_1.DELHIVERY_TRANSIT_LABEL),
//                 cod: true,
//             });
//         }
//     }
//     // Nothing from either courier (or no record at all) -> default Speed Post option.
//     if (options.length === 0) {
//         courier = "SPEEDPOST";
//         options.push({
//             code: exports.DEFAULT_OPTION.code,
//             name: exports.DEFAULT_OPTION.name,
//             price: exports.DEFAULT_OPTION.price,
//             transitDays: null,
//             transitLabel: exports.DEFAULT_OPTION.transitLabel,
//             cod: false,
//         });
//     }
//     return {
//         pincode,
//         serviceable: true,
//         courier,
//         options: options.map((o) => ({
//             ...o,
//             courier: o.courier ?? courier,
//             // COD handling fee applies once here, regardless of which branch above
//             // built the option or how its base price was computed. `codFee` is
//             // exposed separately (on top of the already-inclusive `price`) so
//             // consumers can show the shopper a "base + COD fee" breakdown.
//             price: o.cod ? o.price + exports.COD_HANDLING_FEE : o.price,
//             codFee: o.cod ? exports.COD_HANDLING_FEE : null,
//         })),
//     };
// }
// /** DB-backed wrapper used by the routes. */
// async function resolveServiceabilityForPincode(rawPincode) {
//     const pincode = rawPincode.trim();
//     const rec = await PincodeServiceability_1.PincodeServiceability.findOne({ pincode }).lean();
//     return resolveFromRecord(pincode, rec);
// }
// /**
//  * Shapes the resolver result for the public API. Kept as a seam in case fields
//  * ever need to be withheld again; currently a straight passthrough (the store
//  * wants the delivery-partner name included).
//  */
// function toPublicServiceability(r) {
//     return r;
// }



"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COD_HANDLING_FEE = exports.DEFAULT_OPTION = void 0;
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
    transitLabel: "8-10 business days
};
/**
 * Flat handling fee added on top of every COD option's price, regardless of
 * which courier is fulfilling it or mputed. Applied
 * once, centrally, in resolveFromRecord below - never add it at an individual
 * option's construction site.
 */
exports.COD_HANDLING_FEE = 25;
function daysLabel(days) {
    if (days === null || days === und(days))
        return "";
    return days === 1 ? "1 business dys`;
}
/** Prefer a label stored on the docu count, then to text. */
function transitTextFor(info, fallback) {
    return info?.transitLabel || days| fallback;
}
/**
 * Pure decision logic - no database.
 *
 *  - If DTDC serves the pincode, the customer is offered DTDC options:
 *      Standard (Surface, always freD when DTDC flags it.
 *    If DTDC serves the pincode but has no COD of its own, Delhivery's COD option
 *    is borrowed (tagged courier "DElags COD there.
 *  - Delhivery is otherwise used only when DTDC does not serve the pincode at all.
 *    It then offers a single "StandaDelhivery flags it.
 *  - If neither courier has data for the pincode, a single default Speed Post
 *    option (prepaid, no COD) is ret left with nothing.
 *  - The fulfilling partner ("DTDC" | "DELHIVERY" | "SPEEDPOST") is included on
 *    the result and on every option.
 */
function resolveFromRecord(pincode, r
    // Options normally inherit the pincode's single fulfilling courier. A row may
    // carry its own `courier` to oveTDC->Delhivery COD
    // fallback below).
    const options = [];
    let courier = "SPEEDPOST";
    if (rec && rec.serviceable && rec
        const { dtdc } = rec;
        courier = "DTDC";
        // Standard = DTDC Surface. A null tier means "not offered", never "free".
        if (dtdc.surface?.available)
            options.push({
                code: "STANDARD",
                name: "Standard Delivery",
                price: dtdc.surface.p
                transitDays: dtdc.surface.transitDays,
                transitLabel: transitndard delivery"),
                cod: false,
            });
        }
        // Priority = DTDC Air.
        if (dtdc.air?.available) {
            options.push({
                code: "PRIORITY",
                name: "Priority Deliv
                price: dtdc.air.price,
                transitDays: dtdc.air
                transitLabel: transitTextFor(dtdc.air, "Priority delivery"),
                cod: false,
            });
        }
        // COD rides on the DTDC network; fee already stored as the Air price.
        if (dtdc.cod?.available) {
            const codDays = dtdc.cod.transitDays ?? dtdc.air?.transitDays ??
dtdc.surface?.transitDays ?? null;
            options.push({
                code: "COD",
                name: "Cash on Delivery",
                price: dtdc.cod.price
                transitDays: codDays,
                transitLabel: transitDays, transitLabel:dtdc.cod.transitLabel }, "Pay when your order arrives"),
                cod: true,
            });
        }
        else if (rec.delhivery?.cod?.available) {
            // DTDC serves this pincorow Delhivery's COD so the
            // customer still gets a pay-on-delivery option. Price = Delhivery's own
            // Standard price (120, ome convention as DTDC
            // COD riding on its Air price above - NOT the small zone COD handling fee.
            // This row is fulfilled s its own courier tag.
            const delCod = rec.delhivery.cod;
            const delStandard = rec.d
            options.push({
                code: "COD",
                name: "Cash on Delivery",
                price: delStandard?.p
                transitDays: delStandard?.transitDays ?? delCod.transitDays,
                transitLabel: transitCod,pincodeDataset_1.DELHIVERY_TRANSIT_LABEL),
                cod: true,
                courier: "DELHIVERY",
            });
        }
    }
    else if (rec && rec.serviceable && rec.delhivery?.serviceable) {
        // ---- Delhivery fallback (Dncode) ----
        const { delhivery } = rec;
        courier = "DELHIVERY";
        if (delhivery.standard?.available) {
            options.push({
                code: "STANDARD",
                name: "Standard Deliv
                price: delhivery.standard.price,
                transitDays: delhiver
                transitLabel: transitTextFor(delhivery.standard,
pincodeDataset_1.DELHIVERY_TRANSIT_LA
                cod: false,
            });
        }
        if (delhivery.cod?.available)
            options.push({
                code: "COD",
                name: "Cash on Delivery",
                price: delhivery.cod.
                transitDays: delhivery.cod.transitDays,
                transitLabel: transitpincodeDataset_1.DELHIVERY_TRANSIT_LABEL),
                cod: true,
            });
        }
    }
    // Nothing from either courier (oault Speed Post option.
    if (options.length === 0) {
        courier = "SPEEDPOST";
        options.push({
            code: exports.DEFAULT_OPT
            name: exports.DEFAULT_OPTION.name,
            price: exports.DEFAULT_OP
            transitDays: null,
            transitLabel: exports.DEF
            cod: false,
        });
    }
    return {
        pincode,
        serviceable: true,
        courier,
        options: options.map((o) => (
            ...o,
            courier: o.courier ?? cou
            // `price` stays the bare courier price - the COD handling fee is NOT
            // folded in. It travels t line item instead
            // (extensions/cod-fee-line-item), so Shipping and the COD fee show as
            // two separate amounts i than one bundled
            // shipping total. `codFee` is exposed purely for display/reference.
            codFee: o.cod ? exports.C
        })),
    };
}
/** DB-backed wrapper used by the rou
async function resolveServiceabilityForPincode(rawPincode) {
    const pincode = rawPincode.trim()
    const rec = await PincodeServiceability_1.PincodeServiceability.findOne({ pincode }).lean();
    return resolveFromRecord(pincode,
}
/**
 * Shapes the resolver result for the public API. Kept as a seam in case fields
 * ever need to be withheld again; cuough (the store
 * wants the delivery-partner name included).
 */
function toPublicServiceability(r) {
    return r;
}
