import { Schema, model, Document } from "mongoose";

export type Courier = "DTDC" | "DELHIVERY";
export type Zone = "North" | "Metro" | "Rest of India" | "North East" | string;

/** A single prepaid delivery tier (DTDC Surface, DTDC Air, or Delhivery Standard). */
export interface PrepaidTier {
  available: boolean;
  price: number; // rupees (Surface is always 0)
  transitDays: number | null; // whole-day TAT from the file; null = no day figure (Delhivery)
  transitLabel: string | null; // fixed human label when there is no day number (Delhivery = "8-10 business days")
}

export interface CodInfo {
  available: boolean;
  price: number | null; // rupees; null when not available
  transitDays: number | null; // mirrors the tier COD rides on (DTDC Air); null for Delhivery
  transitLabel: string | null; // fixed label for Delhivery COD
}

export interface DtdcBlock {
  serviceable: boolean;
  surface: PrepaidTier | null; // null = tier not offered for this pincode
  air: PrepaidTier | null;
  cod: CodInfo; // DTDC COD fee = the pincode's Air price (file has no COD-price column)
}

export interface DelhiveryBlock {
  serviceable: boolean;
  standard: PrepaidTier | null; // price = the "TAT" column value (120, or 150 for North East)
  cod: CodInfo; // fee = Sheet2 col B by zone (50 / 78 / 82 / 100)
}

export interface PincodeServiceabilityDoc extends Document {
  pincode: string;
  zone: Zone;
  state: string;
  serviceable: boolean; // true if any courier offers anything here
  dtdc: DtdcBlock;
  delhivery: DelhiveryBlock;
  updatedAt: Date;
}

const PrepaidTierSchema = new Schema<PrepaidTier>(
  {
    available: { type: Boolean, required: true },
    price: { type: Number, required: true },
    transitDays: { type: Number, default: null },
    transitLabel: { type: String, default: null },
  },
  { _id: false }
);

const CodInfoSchema = new Schema<CodInfo>(
  {
    available: { type: Boolean, required: true, default: false },
    price: { type: Number, default: null },
    transitDays: { type: Number, default: null },
    transitLabel: { type: String, default: null },
  },
  { _id: false }
);

const PincodeServiceabilitySchema = new Schema<PincodeServiceabilityDoc>(
  {
    pincode: { type: String, required: true, unique: true, trim: true },
    zone: { type: String, default: "" },
    state: { type: String, default: "" },
    serviceable: { type: Boolean, required: true, default: false },
    dtdc: {
      serviceable: { type: Boolean, required: true, default: false },
      surface: { type: PrepaidTierSchema, default: null },
      air: { type: PrepaidTierSchema, default: null },
      cod: { type: CodInfoSchema, default: () => ({ available: false, price: null }) },
    },
    delhivery: {
      serviceable: { type: Boolean, required: true, default: false },
      standard: { type: PrepaidTierSchema, default: null },
      cod: { type: CodInfoSchema, default: () => ({ available: false, price: null }) },
    },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const PincodeServiceability = model<PincodeServiceabilityDoc>(
  "PincodeServiceability",
  PincodeServiceabilitySchema
);

export const COLLECTION_NAME = "pincodeserviceabilities";
