import cors from "cors";
import express from "express";

const app = express();

app.use(
  cors({
    origin: "*",
    credentials: true,
  }),
);

app.get("/api/profile", (_req, res) => {
  console.log("process.env dump", process.env);
  res.json({ ok: true });
});

export default app;
