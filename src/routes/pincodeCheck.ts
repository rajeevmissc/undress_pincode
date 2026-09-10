import { Router, Request, Response } from "express";
import {
  resolveServiceabilityForPincode,
  toPublicServiceability,
} from "../services/rateResolver";

const router = Router();

const PINCODE_RE = /^[1-9][0-9]{5}$/; // 6-digit Indian PIN, doesn't start with 0

// GET /check/400001 - safe to call directly from the storefront (no courier names leak)
router.get("/check/:pincode", async (req: Request, res: Response) => {
  const { pincode } = req.params;

  if (!PINCODE_RE.test(pincode)) {
    return res.status(400).json({ error: "Enter a valid 6-digit PIN code" });
  }

  const resolved = await resolveServiceabilityForPincode(pincode);
  return res.json(toPublicServiceability(resolved));
});

export default router;
