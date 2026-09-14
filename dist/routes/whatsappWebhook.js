"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const phone_1 = require("../services/phone");
const ultramsg_1 = require("../services/ultramsg");
const shopifyAdmin_1 = require("../services/shopifyAdmin");
const OrderConfirmation_1 = require("../models/OrderConfirmation");
const router = (0, express_1.Router)();
router.post("/ultramsg-incoming", async (req, res) => {
    try {
        const payload = req.body;
        const data = payload?.data;
        // Ignore anything that isn't a genuine incoming text message: our own
        // outgoing messages get echoed back through this same webhook
        // (fromMe: true), and non-"chat" types are media/location/etc, which
        // never carry a usable reply.
        if (payload?.event_type !== "message_received" || !data || data.fromMe || data.type !== "chat") {
            return res.status(200).json({ skipped: "not-a-reply" });
        }
        const phone = (0, phone_1.normalizeIndianPhone)(data.from);
        if (!phone) {
            return res.status(200).json({ skipped: "unrecognized-sender" });
        }
        const confirmation = await OrderConfirmation_1.OrderConfirmation.findOne({ phone }).sort({ createdAt: -1 });
        if (!confirmation) {
            // No order to react to for this number - stay silent rather than
            // reply-spam every unrelated WhatsApp message this number ever sends.
            return res.status(200).json({ skipped: "no-pending-order" });
        }
        if (confirmation.status !== "pending") {
            // Already resolved (e.g. customer replies twice, or after the window
            // for a reply has passed) - don't re-run cancellation/tagging.
            const reply = confirmation.status === "confirmed"
                ? (0, ultramsg_1.buildConfirmedReply)(confirmation.orderName, confirmation.orderStatusUrl)
                : (0, ultramsg_1.buildCancelledReply)(confirmation.orderName, confirmation.orderStatusUrl);
            await (0, ultramsg_1.sendWhatsAppMessage)(phone, reply);
            return res.status(200).json({ skipped: "already-resolved" });
        }
        const intent = (0, phone_1.parseReplyIntent)(data.body);
        if (intent === "unrecognized") {
            await (0, ultramsg_1.sendWhatsAppMessage)(phone, (0, ultramsg_1.buildUnrecognizedReply)(confirmation.orderName));
            return res.status(200).json({ ok: true, intent });
        }
        if (intent === "confirm") {
            confirmation.status = "confirmed";
            confirmation.respondedAt = new Date();
            await confirmation.save();
            try {
                await (0, shopifyAdmin_1.addOrderTag)(confirmation.shopifyOrderId, "WhatsApp Confirmed");
            }
            catch (tagErr) {
                // Tagging is a nice-to-have for the merchant's own visibility - never
                // let it block telling the customer their confirmation went through.
                console.error("addOrderTag failed (non-fatal):", tagErr);
            }
            await (0, ultramsg_1.sendWhatsAppMessage)(phone, (0, ultramsg_1.buildConfirmedReply)(confirmation.orderName, confirmation.orderStatusUrl));
            return res.status(200).json({ ok: true, intent });
        }
        // intent === "cancel"
        try {
            await (0, shopifyAdmin_1.cancelOrder)(confirmation.shopifyOrderId);
        }
        catch (cancelErr) {
            // Leave status as "pending" so this shows up as unresolved rather than
            // silently lying to the merchant that it was cancelled.
            console.error("cancelOrder failed:", cancelErr);
            await (0, ultramsg_1.sendWhatsAppMessage)(phone, `Sorry, we couldn't process the cancellation for ${confirmation.orderName} automatically. Please contact us directly.`);
            return res.status(200).json({ ok: false, intent, error: "cancel-failed" });
        }
        confirmation.status = "cancelled";
        confirmation.respondedAt = new Date();
        await confirmation.save();
        await (0, ultramsg_1.sendWhatsAppMessage)(phone, (0, ultramsg_1.buildCancelledReply)(confirmation.orderName, confirmation.orderStatusUrl));
        return res.status(200).json({ ok: true, intent });
    }
    catch (err) {
        console.error("ultramsg-incoming webhook error:", err);
        // 200, not 500: UltraMsg has no useful retry semantics for us to lean on
        // here, and we don't want it hammering this endpoint on our own bugs.
        return res.status(200).json({ error: "internal error" });
    }
});
exports.default = router;
