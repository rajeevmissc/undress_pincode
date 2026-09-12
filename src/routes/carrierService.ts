import { Router, Request, Response } from "express";
import { resolveServiceabilityForPincode } from "../services/rateResolver";

const router = Router();

// Shopify's request/response shapes for the Carrier Service API (subset used here)
interface ShopifyRateRequest {
  rate: {
    destination: {
      country?: string;
      postal_code?: string;
      zip?: string;
    };
  };
}

interface ShopifyRate {
  service_name: string;
  service_code: string;
  total_price: string; // integer string, smallest currency unit (paise)
  currency: string;
  description?: string;
  min_delivery_date?: string;
  max_delivery_date?: string;
  courier?: string; // delivery partner - extra field, ignored by Shopify, used by our own tooling
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

router.post("/rates", async (req: Request, res: Response) => {
  try {
    const body = req.body as ShopifyRateRequest;
    const zip = body?.rate?.destination?.postal_code || body?.rate?.destination?.zip;

    if (!zip) {
      // No postal code yet (e.g. mid-address-entry) - return no rates rather than error
      return res.json({ rates: [] });
    }

    const resolved = await resolveServiceabilityForPincode(zip);
    const now = new Date();

    const rates: ShopifyRate[] = resolved.options.map((opt) => {
      // Spell out the COD handling fee in the description so the shopper sees
      // why this option costs more than the equivalent prepaid one, instead of
      // just a bare total.
      
      // const description = opt.codFee
      //   ? `${opt.transitLabel} (includes ₹${opt.codFee} COD handling fee)`
      //   : opt.transitLabel;

      const hasDateEstimate = !!(opt.transitDays && opt.transitDays > 0);
      
      const feeNote = opt.codFee
          ? `Includes ₹${opt.codFee} COD handling charge. This charge is waived if you choose to pay online now.`
          : null;
      
      const description = hasDateEstimate
          ? [opt.transitLabel, feeNote].filter(Boolean).join("\n")
          : [opt.transitLabel, feeNote].filter(Boolean).join("\n");
      const rate: ShopifyRate = {
        service_name: opt.name,
        service_code: opt.code,
        total_price: String(Math.round(opt.price * 100)),
        currency: "INR",
        description,
        courier: opt.courier,
      };
      if (hasDateEstimate) {
        rate.min_delivery_date = now.toISOString();
        rate.max_delivery_date = addBusinessDays(now, opt.transitDays as number).toISOString();
      }
      return rate;
    });

    // Empty array (not an error) is how you tell Shopify "we have no rates for this address"
    return res.json(rates.length ? { rates, courier: resolved.courier } : { rates });
  } catch (err) {
    console.error("carrier-service /rates error:", err);
    // A 5xx here makes Shopify fall back to any other configured rate provider
    // instead of showing a broken checkout - safer than a 200 with bad data.
    return res.status(500).json({ rates: [] });
  }
});

export default router;


