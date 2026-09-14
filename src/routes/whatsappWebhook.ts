import { Router, Request, Response } from "express";
import { normalizeIndianPhone, parseReplyIntent } from "../services/phone";
import {
  sendWhatsAppMessage,
  buildConfirmedReply,
  buildCancelledReply,
  buildUnrecognizedReply,
} from "../services/ultramsg";
import { cancelOrder, addOrderTag } from "../services/shopifyAdmin";
import { OrderConfirmation } from "../models/OrderConfirmation";

const router = Router();

interface UltraMsgIncomingPayload {
  event_type?: string;
  data?: {
    from?: string;
    body?: string;
    fromMe?: boolean;
    type?: string;
  };
}

router.post("/ultramsg-incoming", async (req: Request, res: Response) => {
  try {
    const payload = req.body as UltraMsgIncomingPayload;
    const data = payload?.data;

    // Ignore anything that isn't a genuine incoming text message: our own
    // outgoing messages get echoed back through this same webhook
    // (fromMe: true), and non-"chat" types are media/location/etc, which
    // never carry a usable reply.
    if (payload?.event_type !== "message_received" || !data || data.fromMe || data.type !== "chat") {
      return res.status(200).json({ skipped: "not-a-reply" });
    }

    const phone = normalizeIndianPhone(data.from);
    if (!phone) {
      return res.status(200).json({ skipped: "unrecognized-sender" });
    }

    const confirmation = await OrderConfirmation.findOne({ phone }).sort({ createdAt: -1 });
    if (!confirmation) {
      // No order to react to for this number - stay silent rather than
      // reply-spam every unrelated WhatsApp message this number ever sends.
      return res.status(200).json({ skipped: "no-pending-order" });
    }

    if (confirmation.status !== "pending") {
      // Already resolved (e.g. customer replies twice, or after the window
      // for a reply has passed) - don't re-run cancellation/tagging.
      const reply =
        confirmation.status === "confirmed"
          ? buildConfirmedReply(confirmation.orderName)
          : buildCancelledReply(confirmation.orderName);
      await sendWhatsAppMessage(phone, reply);
      return res.status(200).json({ skipped: "already-resolved" });
    }

    const intent = parseReplyIntent(data.body);

    if (intent === "unrecognized") {
      await sendWhatsAppMessage(phone, buildUnrecognizedReply(confirmation.orderName));
      return res.status(200).json({ ok: true, intent });
    }

    if (intent === "confirm") {
      confirmation.status = "confirmed";
      confirmation.respondedAt = new Date();
      await confirmation.save();

      try {
        await addOrderTag(confirmation.shopifyOrderId, "WhatsApp Confirmed");
      } catch (tagErr) {
        // Tagging is a nice-to-have for the merchant's own visibility - never
        // let it block telling the customer their confirmation went through.
        console.error("addOrderTag failed (non-fatal):", tagErr);
      }

      await sendWhatsAppMessage(phone, buildConfirmedReply(confirmation.orderName));
      return res.status(200).json({ ok: true, intent });
    }

    // intent === "cancel"
    try {
      await cancelOrder(confirmation.shopifyOrderId);
    } catch (cancelErr) {
      // Leave status as "pending" so this shows up as unresolved rather than
      // silently lying to the merchant that it was cancelled.
      console.error("cancelOrder failed:", cancelErr);
      await sendWhatsAppMessage(
        phone,
        `Sorry, we couldn't process the cancellation for ${confirmation.orderName} automatically. Please contact us directly.`
      );
      return res.status(200).json({ ok: false, intent, error: "cancel-failed" });
    }

    confirmation.status = "cancelled";
    confirmation.respondedAt = new Date();
    await confirmation.save();
    await sendWhatsAppMessage(phone, buildCancelledReply(confirmation.orderName));
    return res.status(200).json({ ok: true, intent });
  } catch (err) {
    console.error("ultramsg-incoming webhook error:", err);
    // 200, not 500: UltraMsg has no useful retry semantics for us to lean on
    // here, and we don't want it hammering this endpoint on our own bugs.
    return res.status(200).json({ error: "internal error" });
  }
});

export default router;
