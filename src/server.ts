import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDb } from "./db";
import carrierServiceRoutes from "./routes/carrierService";
import pincodeCheckRoutes from "./routes/pincodeCheck";
import adminImportRoutes from "./routes/adminImport";

async function main() {
  await connectDb();

  const app = express();
  app.use(express.json());

  // Called by Shopify at checkout - must stay fast and public (Shopify calls it server-to-server)
  app.use("/shopify", carrierServiceRoutes);

  // Called by your storefront theme AND the checkout extension (cross-origin
  // from Shopify's checkout sandbox), so this needs CORS enabled. Only exposes
  // resolved rates, never courier names, so open CORS here is intentional and safe.
  app.use("/", cors(), pincodeCheckRoutes);

  // Called by your own admin tooling to load/refresh the two courier CSVs
  app.use("/admin", adminImportRoutes);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Listening on :${port}`));
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
