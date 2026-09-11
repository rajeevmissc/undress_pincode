import {
  PincodeServiceability,
  Courier,
  PincodeServiceabilityDoc,
} from "../models/PincodeServiceability";
import { DELHIVERY_TRANSIT_LABEL } from "./pincodeDataset";

export type OptionCode = "STANDARD" | "PRIORITY" | "COD" | "SPEEDPOST";

/** The delivery partner fulfilling the pincode. Included in API responses. */
export type FulfilmentChannel = Courier | "SPEEDPOST";

export interface DeliveryOption {
  code: OptionCode;
  name: string;
  price: number; // rupees
  transitDays: number | null; // whole-day estimate, or null when we only have a text label
  transitLabel: string; // human string shown to the customer
  cod: boolean;
  courier: FulfilmentChannel; // "DTDC" | "DELHIVERY" | "SPEEDPOST"
}

export interface ResolvedServiceability {
  pincode: string;
  serviceable: boolean;
  courier: FulfilmentChannel; // which partner fulfils this pincode (same for all its options)
  options: DeliveryOption[];
}

/**
 * Last-resort option used when neither DTDC nor Delhivery has data for a pincode
 * (including a pincode that isn't in the DB at all). Speed Post reaches every
 * Indian PIN, so with this the checkout always has at least one shipping option.
 */
export const DEFAULT_OPTION = {
  code: "SPEEDPOST" as const,
  name: "Speed Post",
  price: 100,
  transitLabel: "8-10 business days",
};

/** Just the fields the resolver needs - lets tests pass plain objects. */
export type PincodeInput = Pick<
  PincodeServiceabilityDoc,
  "serviceable" | "dtdc" | "delhivery"
> | null | undefined;

function daysLabel(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return "";
  return days === 1 ? "1 business day" : `${days} business days`;
}

/** Prefer a label stored on the document; fall back to the day count, then to text. */
function transitTextFor(
  info: { transitDays?: number | null; transitLabel?: string | null } | null | undefined,
  fallback: string
): string {
  return info?.transitLabel || daysLabel(info?.transitDays) || fallback;
}

/**
 * Pure decision logic - no database.
 *
 *  - If DTDC serves the pincode, the customer is offered DTDC options:
 *      Standard (Surface, always free), Priority (Air), and COD when DTDC flags it.
 *    If DTDC serves the pincode but has no COD of its own, Delhivery's COD option
 *    is borrowed (tagged courier "DELHIVERY") when Delhivery flags COD there.
 *  - Delhivery is otherwise used only when DTDC does not serve the pincode at all.
 *    It then offers a single "Standard" option, plus COD when Delhivery flags it.
 *  - If neither courier has data for the pincode, a single default Speed Post
 *    option (prepaid, no COD) is returned so checkout is never left with nothing.
 *  - The fulfilling partner ("DTDC" | "DELHIVERY" | "SPEEDPOST") is included on
 *    the result and on every option.
 */
export function resolveFromRecord(pincode: string, rec: PincodeInput): ResolvedServiceability {
  // Options normally inherit the pincode's single fulfilling courier. A row may
  // carry its own `courier` to override that (used for the DTDC->Delhivery COD
  // fallback below).
  const options: (Omit<DeliveryOption, "courier"> & { courier?: FulfilmentChannel })[] = [];
  let courier: FulfilmentChannel = "SPEEDPOST";

  if (rec && rec.serviceable && rec.dtdc?.serviceable) {
    const { dtdc } = rec;
    courier = "DTDC";

    // Standard = DTDC Surface. A null tier means "not offered", never "free".
    if (dtdc.surface?.available) {
      options.push({
        code: "STANDARD",
        name: "Standard Delivery",
        price: dtdc.surface.price,
        transitDays: dtdc.surface.transitDays,
        transitLabel: transitTextFor(dtdc.surface, "Standard delivery"),
        cod: false,
      });
    }

    // Priority = DTDC Air.
    if (dtdc.air?.available) {
      options.push({
        code: "PRIORITY",
        name: "Priority Delivery",
        price: dtdc.air.price,
        transitDays: dtdc.air.transitDays,
        transitLabel: transitTextFor(dtdc.air, "Priority delivery"),
        cod: false,
      });
    }

    // COD rides on the DTDC network; fee already stored as the Air price.
    if (dtdc.cod?.available) {
      const codDays = dtdc.cod.transitDays ?? dtdc.air?.transitDays ?? dtdc.surface?.transitDays ?? null;
      options.push({
        code: "COD",
        name: "Cash on Delivery",
        price: dtdc.cod.price ?? 0,
        transitDays: codDays,
        transitLabel: transitTextFor({ transitDays: codDays, transitLabel: dtdc.cod.transitLabel }, "Pay when your order arrives"),
        cod: true,
      });
    } else if (rec.delhivery?.cod?.available) {
      // DTDC serves this pincode but offers no COD - borrow Delhivery's COD so the
      // customer still gets a pay-on-delivery option. Price = Delhivery's own
      // Standard price (120, or 150 for North East) - same convention as DTDC
      // COD riding on its Air price above - NOT the small zone COD handling fee.
      // This row is fulfilled by Delhivery, so it carries its own courier tag.
      const delCod = rec.delhivery.cod;
      const delStandard = rec.delhivery.standard;
      options.push({
        code: "COD",
        name: "Cash on Delivery",
        price: delStandard?.price ?? delCod.price ?? 0,
        transitDays: delStandard?.transitDays ?? delCod.transitDays,
        transitLabel: transitTextFor(delStandard ?? delCod, DELHIVERY_TRANSIT_LABEL),
        cod: true,
        courier: "DELHIVERY",
      });
    }
  } else if (rec && rec.serviceable && rec.delhivery?.serviceable) {
    // ---- Delhivery fallback (DTDC does not serve this pincode) ----
    const { delhivery } = rec;
    courier = "DELHIVERY";

    if (delhivery.standard?.available) {
      options.push({
        code: "STANDARD",
        name: "Standard Delivery",
        price: delhivery.standard.price,
        transitDays: delhivery.standard.transitDays,
        transitLabel: transitTextFor(delhivery.standard, DELHIVERY_TRANSIT_LABEL),
        cod: false,
      });
    }

    if (delhivery.cod?.available) {
      options.push({
        code: "COD",
        name: "Cash on Delivery",
        price: delhivery.cod.price ?? 0,
        transitDays: delhivery.cod.transitDays,
        transitLabel: transitTextFor(delhivery.cod, DELHIVERY_TRANSIT_LABEL),
        cod: true,
      });
    }
  }

  // Nothing from either courier (or no record at all) -> default Speed Post option.
  if (options.length === 0) {
    courier = "SPEEDPOST";
    options.push({
      code: DEFAULT_OPTION.code,
      name: DEFAULT_OPTION.name,
      price: DEFAULT_OPTION.price,
      transitDays: null,
      transitLabel: DEFAULT_OPTION.transitLabel,
      cod: false,
    });
  }

  return {
    pincode,
    serviceable: true,
    courier,
    options: options.map((o) => ({ ...o, courier: o.courier ?? courier })),
  };
}

/** DB-backed wrapper used by the routes. */
export async function resolveServiceabilityForPincode(
  rawPincode: string
): Promise<ResolvedServiceability> {
  const pincode = rawPincode.trim();
  const rec = await PincodeServiceability.findOne({ pincode }).lean();
  return resolveFromRecord(pincode, rec as PincodeInput);
}

/**
 * Shapes the resolver result for the public API. Kept as a seam in case fields
 * ever need to be withheld again; currently a straight passthrough (the store
 * wants the delivery-partner name included).
 */
export function toPublicServiceability(r: ResolvedServiceability) {
  return r;
}
