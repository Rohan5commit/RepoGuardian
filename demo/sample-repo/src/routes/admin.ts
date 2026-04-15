import { Router } from "express";

const router = Router();

router.get("/admin/export-users", async (_req, res) => {
  res.json({
    exported: true,
    count: 1204,
  });
});

export default router;
