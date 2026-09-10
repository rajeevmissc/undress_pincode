import { Router, Request, Response } from "express";
import multer from "multer";
import { importFromBuffer } from "../services/pincodeStore";

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

export default router;
