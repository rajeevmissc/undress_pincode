"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DELHIVERY_TRANSIT_LABEL = void 0;
exports.parseZoneRateCard = parseZoneRateCard;
exports.parseWorkbook = parseWorkbook;
const DATA_START_ROW = 6;
/**
 * The file gives no day-level transit figure for Delhivery (only a "120"/"150"
 * value we use as the price), so every Delhivery option carries this fixed label,
 * and it is stored on the document so the DB is self-describing.
 */
exports.DELHIVERY_TRANSIT_LABEL = "8-10 business days";
function isYes(v) {
    return String(v ?? "").trim().toUpperCase() === "Y";
}
function toNum(v) {
    if (v === null || v === undefined)
        return null;
    if (typeof v === "number")
        return Number.isFinite(v) ? v : null;
    const s = String(v).trim();
    if (s === "" || s.toUpperCase() === "NA")
        return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}
function cellValue(row, col) {
    const v = row.getCell(col).value;
    // ExcelJS can wrap some cells as { result } / { text } / rich-text objects.
    if (v && typeof v === "object") {
        const anyV = v;
        if ("result" in anyV)
            return anyV.result;
        if ("text" in anyV)
            return anyV.text;
        if ("richText" in anyV && Array.isArray(anyV.richText)) {
            return anyV.richText.map((p) => p.text).join("");
        }
    }
    return v;
}
/** Reads Sheet2 into { zone -> Delhivery COD fee (col B) }. */
function parseZoneRateCard(wb) {
    const warnings = [];
    const ws = wb.getWorksheet("Sheet2");
    const zoneCodFees = {};
    if (!ws) {
        warnings.push('Sheet2 (zone rate card) not found - Delhivery COD fees will be missing.');
        return { zoneCodFees, warnings };
    }
    ws.eachRow((row) => {
        const zone = String(cellValue(row, 1) ?? "").trim();
        const colB = toNum(cellValue(row, 3));
        if (zone && colB !== null)
            zoneCodFees[zone] = colB;
    });
    return { zoneCodFees, warnings };
}
function parseWorkbook(wb) {
    const { zoneCodFees, warnings } = parseZoneRateCard(wb);
    const ws = wb.getWorksheet("Sheet1");
    if (!ws)
        throw new Error("Sheet1 not found in workbook");
    const records = [];
    const seen = new Set();
    ws.eachRow((row, rowNumber) => {
        if (rowNumber < DATA_START_ROW)
            return;
        const rawPin = cellValue(row, 1);
        if (rawPin === null || rawPin === undefined || String(rawPin).trim() === "")
            return;
        const pincode = String(rawPin).trim();
        if (!/^[1-9][0-9]{5}$/.test(pincode)) {
            warnings.push(`Row ${rowNumber}: skipped non-pincode value "${pincode}"`);
            return;
        }
        if (seen.has(pincode)) {
            warnings.push(`Row ${rowNumber}: duplicate pincode ${pincode} - later row ignored`);
            return;
        }
        seen.add(pincode);
        const zone = String(cellValue(row, 2) ?? "").trim();
        const state = String(cellValue(row, 14) ?? "").trim();
        // ---- DTDC ----
        const surfacePrepaid = isYes(cellValue(row, 3));
        const airPrepaid = isYes(cellValue(row, 4));
        const dtdcCodFlag = isYes(cellValue(row, 5)) || isYes(cellValue(row, 6));
        const surfaceTat = toNum(cellValue(row, 7));
        const airTat = toNum(cellValue(row, 8));
        const surfacePrice = toNum(cellValue(row, 9)) ?? 0;
        const airPrice = toNum(cellValue(row, 10));
        const dtdcServiceable = surfacePrepaid || airPrepaid;
        const surface = surfacePrepaid
            ? { available: true, price: surfacePrice, transitDays: surfaceTat, transitLabel: null }
            : null;
        const air = airPrepaid
            ? { available: true, price: airPrice ?? 0, transitDays: airTat, transitLabel: null }
            : null;
        // DTDC COD fee = the pincode's Air price (file has no COD-price column, and
        // every COD pincode also has Air - verified across all 24,056 rows).
        // COD rides on the Air tier, so it inherits the Air TAT.
        const dtdcCodAvailable = dtdcCodFlag && dtdcServiceable;
        const dtdcCod = {
            available: dtdcCodAvailable,
            price: dtdcCodAvailable ? airPrice ?? surfacePrice : null,
            transitDays: dtdcCodAvailable ? airTat ?? surfaceTat : null,
            transitLabel: null,
        };
        if (dtdcCodAvailable && airPrice === null) {
            warnings.push(`Row ${rowNumber} (${pincode}): DTDC COD available but no Air price - COD fee fell back to Surface price`);
        }
        // ---- Delhivery ----
        const delhiveryPrepaid = isYes(cellValue(row, 11));
        const delhiveryCodFlag = isYes(cellValue(row, 12));
        const delhiveryPrice = toNum(cellValue(row, 13)); // the "TAT" column value, used as price
        const delhiveryServiceable = delhiveryPrepaid || delhiveryCodFlag;
        const delhiveryStandard = delhiveryPrepaid
            ? { available: true, price: delhiveryPrice ?? 0, transitDays: null, transitLabel: exports.DELHIVERY_TRANSIT_LABEL }
            : null;
        const delhiveryCodFee = zone in zoneCodFees ? zoneCodFees[zone] : null;
        const delhiveryCod = {
            available: delhiveryCodFlag,
            price: delhiveryCodFlag ? delhiveryCodFee : null,
            transitDays: null,
            transitLabel: delhiveryCodFlag ? exports.DELHIVERY_TRANSIT_LABEL : null,
        };
        if (delhiveryCodFlag && delhiveryCodFee === null) {
            warnings.push(`Row ${rowNumber} (${pincode}): Delhivery COD available but zone "${zone}" has no Sheet2 rate`);
        }
        records.push({
            pincode,
            zone,
            state,
            serviceable: dtdcServiceable || delhiveryServiceable,
            dtdc: { serviceable: dtdcServiceable, surface, air, cod: dtdcCod },
            delhivery: {
                serviceable: delhiveryServiceable,
                standard: delhiveryStandard,
                cod: delhiveryCod,
            },
        });
    });
    return { records, zoneCodFees, warnings };
}
