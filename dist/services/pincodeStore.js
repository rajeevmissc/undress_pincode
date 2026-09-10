"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.replaceAllPincodes = replaceAllPincodes;
exports.importFromBuffer = importFromBuffer;
const mongoose_1 = __importDefault(require("mongoose"));
const exceljs_1 = require("exceljs");
const PincodeServiceability_1 = require("../models/PincodeServiceability");
const pincodeDataset_1 = require("./pincodeDataset");
const LEGACY_COLLECTIONS = ["pincoderates"];
/** Wipes the pincode collection and reloads it from the parsed records. Full refresh. */
async function replaceAllPincodes(records) {
    const now = new Date();
    const docs = records.map((r) => ({ ...r, updatedAt: now }));
    const legacyCollectionsDropped = [];
    const db = mongoose_1.default.connection.db;
    if (db) {
        const existing = (await db.listCollections().toArray()).map((c) => c.name);
        for (const name of LEGACY_COLLECTIONS) {
            if (existing.includes(name)) {
                await db.dropCollection(name);
                legacyCollectionsDropped.push(name);
            }
        }
    }
    await PincodeServiceability_1.PincodeServiceability.syncIndexes();
    await PincodeServiceability_1.PincodeServiceability.deleteMany({});
    let inserted = 0;
    const BATCH = 2000;
    for (let i = 0; i < docs.length; i += BATCH) {
        const chunk = docs.slice(i, i + BATCH);
        await PincodeServiceability_1.PincodeServiceability.insertMany(chunk, { ordered: false });
        inserted += chunk.length;
    }
    const serviceable = records.filter((r) => r.serviceable).length;
    const dtdcServiceable = records.filter((r) => r.dtdc.serviceable).length;
    const delhiveryFallback = records.filter((r) => r.serviceable && !r.dtdc.serviceable).length;
    return {
        totalRows: records.length,
        inserted,
        serviceable,
        dtdcServiceable,
        delhiveryFallback,
        noService: records.length - serviceable,
        legacyCollectionsDropped,
        warnings: [],
    };
}
/** Parses a workbook buffer (HTTP upload) and reloads the collection. */
async function importFromBuffer(buffer) {
    const wb = new exceljs_1.Workbook();
    await wb.xlsx.load(buffer);
    const { records, warnings } = (0, pincodeDataset_1.parseWorkbook)(wb);
    if (records.length === 0)
        throw new Error("No pincode rows found in the uploaded workbook");
    const summary = await replaceAllPincodes(records);
    summary.warnings = warnings.slice(0, 25);
    return summary;
}
