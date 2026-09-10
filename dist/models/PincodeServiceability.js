"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLLECTION_NAME = exports.PincodeServiceability = void 0;
const mongoose_1 = require("mongoose");
const PrepaidTierSchema = new mongoose_1.Schema({
    available: { type: Boolean, required: true },
    price: { type: Number, required: true },
    transitDays: { type: Number, default: null },
    transitLabel: { type: String, default: null },
}, { _id: false });
const CodInfoSchema = new mongoose_1.Schema({
    available: { type: Boolean, required: true, default: false },
    price: { type: Number, default: null },
    transitDays: { type: Number, default: null },
    transitLabel: { type: String, default: null },
}, { _id: false });
const PincodeServiceabilitySchema = new mongoose_1.Schema({
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
}, { timestamps: { createdAt: false, updatedAt: true } });
exports.PincodeServiceability = (0, mongoose_1.model)("PincodeServiceability", PincodeServiceabilitySchema);
exports.COLLECTION_NAME = "pincodeserviceabilities";
