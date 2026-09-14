import { Router, Request, Response } from "express";
import multer from "multer";
import { importFromBuffer } from "../services/pincodeStore";
import { normalizeIndianPhone } from "../services/phone";
import { sendWhatsAppMessage } from "../services/ultramsg";
import { resolveToken, ShopifyAdminConfigError } from "../services/shopifyAdmin";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // the workbook is ~2.4 MB
});

function requireAdminKey(req: Request, res: Response, next: () => void) {
  const key = req.header("x-admin-key");
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/**
 * POST /admin/import
 * multipart/form-data, field name "file" = the combined DTDC+Delhivery .xlsx
 * (same file the CLI importer takes). This is a FULL REFRESH of the pincode data.
 */
router.post(
  "/import",
  requireAdminKey,
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: "Attach the .xlsx as form field 'file'" });
    }
    try {
      const summary = await importFromBuffer(req.file.buffer);
      return res.json({ ok: true, ...summary });
    } catch (err) {
      console.error("admin import error:", err);
      return res.status(400).json({ error: "Import failed", detail: String(err) });
    }
  }
);

/**
 * POST /admin/test-whatsapp
 * JSON body: { "to": "+91XXXXXXXXXX", "body": "optional custom text" }
 * Sends one WhatsApp message via UltraMsg using this server's own
 * ULTRAMSG_INSTANCE_ID/ULTRAMSG_TOKEN - a quick way to confirm those env vars
 * (and the UltraMsg instance itself) actually work, without needing a real
 * Shopify order or exposing the credentials to whoever is testing.
 */
router.post("/test-whatsapp", requireAdminKey, async (req: Request, res: Response) => {
  const { to, body } = req.body as { to?: string; body?: string };
  const phone = normalizeIndianPhone(to);
  if (!phone) {
    return res.status(400).json({ error: "Provide a valid Indian phone number as 'to'" });
  }
  try {
    await sendWhatsAppMessage(phone, body || "✅ Test message from your Shopify backend - UltraMsg is wired up correctly.");
    return res.json({ ok: true, sentTo: phone });
  } catch (err) {
    console.error("test-whatsapp error:", err);
    return res.status(502).json({ error: "UltraMsg send failed", detail: String(err) });
  }
});

/**
 * GET /admin/env-check
 * Reports which env vars critical to the webhook/WhatsApp flow are actually
 * set on THIS running process, and a few harmless characteristics (length,
 * first/last character) so a copy-paste mistake (stray space, wrong var,
 * truncated paste) can be spotted without ever printing the secret itself.
 */
router.get("/env-check", requireAdminKey, (_req: Request, res: Response) => {
  const describe = (name: string) => {
    const v = process.env[name];
    if (!v) return { set: false };
    return { set: true, length: v.length, startsWith: v.slice(0, 4), endsWith: v.slice(-4) };
  };
  let adminTokensShops: string[] | "invalid-json" | undefined;
  if (process.env.SHOPIFY_ADMIN_TOKENS) {
    try {
      adminTokensShops = Object.keys(JSON.parse(process.env.SHOPIFY_ADMIN_TOKENS));
    } catch {
      adminTokensShops = "invalid-json";
    }
  }
  return res.json({
    SHOPIFY_SHOP: describe("SHOPIFY_SHOP"),
    SHOPIFY_ADMIN_ACCESS_TOKEN: describe("SHOPIFY_ADMIN_ACCESS_TOKEN"),
    // Multi-store token map - shown as which shops it covers, never the tokens.
    SHOPIFY_ADMIN_TOKENS: adminTokensShops ? { set: true, shops: adminTokensShops } : { set: false },
    SHOPIFY_CLIENT_SECRET: describe("SHOPIFY_CLIENT_SECRET"),
    ULTRAMSG_INSTANCE_ID: describe("ULTRAMSG_INSTANCE_ID"),
    ULTRAMSG_TOKEN: describe("ULTRAMSG_TOKEN"),
  });
});

/**
 * GET /admin/token-check?shop=your-store.myshopify.com
 * Makes one real, cheap Admin API call (GET /shop.json) with the Admin API
 * token this server has for that shop (see services/shopifyAdmin.ts's
 * multi-store token lookup), to tell "token expired/invalid" apart from
 * "token valid but missing a scope" apart from "everything's fine" - without
 * ever printing the token. `shop` defaults to SHOPIFY_SHOP if omitted.
 */
router.get("/token-check", requireAdminKey, async (req: Request, res: Response) => {
  const shop = (req.query.shop as string | undefined) || process.env.SHOPIFY_SHOP;
  if (!shop) {
    return res.status(200).json({ ok: false, reason: "Pass ?shop=your-store.myshopify.com" });
  }
  let token: string;
  try {
    token = resolveToken(shop);
  } catch (err) {
    if (err instanceof ShopifyAdminConfigError) {
      return res.status(200).json({ ok: false, reason: err.message });
    }
    throw err;
  }
  try {
    const shopRes = await fetch(`https://${shop}/admin/api/2026-07/shop.json`, {
      headers: { "X-Shopify-Access-Token": token },
    });
    const scopesRes = await fetch(`https://${shop}/admin/oauth/access_scopes.json`, {
      headers: { "X-Shopify-Access-Token": token },
    });
    const scopesBody = scopesRes.ok ? await scopesRes.json() : await scopesRes.text();
    return res.status(200).json({
      shopCallStatus: shopRes.status,
      shopCallOk: shopRes.ok,
      scopesCallStatus: scopesRes.status,
      grantedScopes: scopesRes.ok ? scopesBody : undefined,
      scopesCallError: scopesRes.ok ? undefined : scopesBody,
    });
  } catch (err) {
    return res.status(200).json({ ok: false, error: String(err) });
  }
});

/**
 * GET /admin/recent-orders?shop=your-store.myshopify.com
 * Lists the most recent orders (from that shop) with a direct Shopify admin
 * link to each - handy for pulling up "the order the tester just placed"
 * without digging through the admin UI. `shop` defaults to SHOPIFY_SHOP.
 */
router.get("/recent-orders", requireAdminKey, async (req: Request, res: Response) => {
  const shop = (req.query.shop as string | undefined) || process.env.SHOPIFY_SHOP;
  if (!shop) {
    return res.status(200).json({ error: "Pass ?shop=your-store.myshopify.com" });
  }
  let token: string;
  try {
    token = resolveToken(shop);
  } catch (err) {
    if (err instanceof ShopifyAdminConfigError) {
      return res.status(200).json({ error: err.message });
    }
    throw err;
  }
  try {
    const ordersRes = await fetch(
      `https://${shop}/admin/api/2026-07/orders.json?status=any&limit=5&order=created_at desc`,
      { headers: { "X-Shopify-Access-Token": token } }
    );
    if (!ordersRes.ok) {
      const text = await ordersRes.text().catch(() => "");
      return res.status(200).json({ error: `Shopify returned ${ordersRes.status}`, detail: text });
    }
    const { orders } = (await ordersRes.json()) as {
      orders: {
        id: number;
        name: string;
        total_price: string;
        currency: string;
        financial_status: string;
        cancelled_at: string | null;
        order_status_url: string;
        tags: string;
        created_at: string;
      }[];
    };
    const storeHandle = shop.replace(".myshopify.com", "");
    return res.json({
      orders: orders.map((o) => ({
        name: o.name,
        total: `${o.currency} ${o.total_price}`,
        status: o.cancelled_at ? "cancelled" : o.financial_status,
        tags: o.tags,
        createdAt: o.created_at,
        adminLink: `https://admin.shopify.com/store/${storeHandle}/orders/${o.id}`,
        customerOrderStatusLink: o.order_status_url,
      })),
    });
  } catch (err) {
    return res.status(200).json({ error: String(err) });
  }
});

export default router;
