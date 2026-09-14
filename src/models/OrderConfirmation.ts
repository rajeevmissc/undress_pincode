import { Schema, model, Document } from "mongoose";

export type ConfirmationStatus = "pending" | "confirmed" | "cancelled";

export interface OrderConfirmationLineItem {
  title: string;
  quantity: number;
  price: string; // per-unit price, formatted string as Shopify sent it
}

export interface OrderConfirmationDoc extends Document {
  shopifyOrderId: string; // the numeric Shopify order id, as a string (safe for large ints)
  orderName: string; // e.g. "#1001" - what the customer/merchant recognise the order by
  phone: string; // E.164-ish, digits only with country code, e.g. "919876543210"
  amount: string; // formatted total, e.g. "13415.00" - stored as sent, not re-derived
  currency: string; // e.g. "INR"
  customerName: string;
  items: OrderConfirmationLineItem[];
  orderStatusUrl: string | null; // Shopify's own per-order, per-customer tracking page
  status: ConfirmationStatus;
  createdAt: Date;
  respondedAt: Date | null;
}

const OrderConfirmationLineItemSchema = new Schema<OrderConfirmationLineItem>(
  {
    title: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: String, required: true },
  },
  { _id: false }
);

const OrderConfirmationSchema = new Schema<OrderConfirmationDoc>({
  shopifyOrderId: { type: String, required: true, unique: true, index: true },
  orderName: { type: String, required: true },
  phone: { type: String, required: true, index: true },
  amount: { type: String, required: true },
  currency: { type: String, required: true },
  customerName: { type: String, default: "there" },
  items: { type: [OrderConfirmationLineItemSchema], default: [] },
  orderStatusUrl: { type: String, default: null },
  status: { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending", index: true },
  createdAt: { type: Date, default: () => new Date() },
  respondedAt: { type: Date, default: null },
});

export const OrderConfirmation = model<OrderConfirmationDoc>("OrderConfirmation", OrderConfirmationSchema);
