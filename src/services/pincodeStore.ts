import mongoose from "mongoose";
import { Workbook } from "exceljs";
import { PincodeServiceability } from "../models/PincodeServiceability";
import { parseWorkbook, PincodeRecord } from "./pincodeDataset";

export interface ImportSummary {
  totalRows: number;
  inserted: number;
  serviceable: number;
  dtdcServiceable: number;
  delhiveryFallback: number; // serviceable pincodes where DTDC does NOT serve
  noService: number;
  legacyCollectionsDropped: string[];
  warnings: string[];
}

const LEGACY_COLLECTIONS = ["pincoderates"];

/** Wipes the pincode collection and reloads it from the parsed records. Full refresh. */
export async function replaceAllPincodes(records: PincodeRecord[]): Promise<ImportSummary> {
  const now = new Date();
  const docs = records.map((r) => ({ ...r, updatedAt: now }));

  const legacyCollectionsDropped: string[] = [];
  const db = mongoose.connection.db;
  if (db) {
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    for (const name of LEGACY_COLLECTIONS) {
      if (existing.includes(name)) {
        await db.dropCollection(name);
        legacyCollectionsDropped.push(name);
      }
    }
  }

  await PincodeServiceability.syncIndexes();
  await PincodeServiceability.deleteMany({});

  let inserted = 0;
  const BATCH = 2000;
  for (let i = 0; i < docs.length; i += BATCH) {
    const chunk = docs.slice(i, i + BATCH);
    await PincodeServiceability.insertMany(chunk, { ordered: false });
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
export async function importFromBuffer(buffer: Buffer): Promise<ImportSummary> {
  const wb = new Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const { records, warnings } = parseWorkbook(wb);
  if (records.length === 0) throw new Error("No pincode rows found in the uploaded workbook");
  const summary = await replaceAllPincodes(records);
  summary.warnings = warnings.slice(0, 25);
  return summary;
}
