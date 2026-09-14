"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderConfirmation = void 0;
const mongoose_1 = require("mongoose");
const OrderConfirmationSchema = new mongoose_1.Schema({
    shopifyOrderId: { type: String, required: true, unique: true, index: true },
    orderName: { type: String, required: true },
    phone: { type: String, required: true, index: true },
    amount: { type: String, required: true },
    currency: { type: String, required: true },
    status: { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending", index: true },
    createdAt: { type: Date, default: () => new Date() },
    respondedAt: { type: Date, default: null },
});
exports.OrderConfirmation = (0, mongoose_1.model)("OrderConfirmation", OrderConfirmationSchema);
