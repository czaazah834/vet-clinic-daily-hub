import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { authRouter } from "../server/routes/auth.js";
import { clinicRouter } from "../server/routes/clinic.js";
import { query } from "../server/db.js";

dotenv.config();

const app = express();

// Trust reverse proxy (Vercel, Cloudflare, Nginx) so req.ip and secure cookies work correctly
app.set("trust proxy", 1);

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health Check
app.get("/api/health", async (req, res) => {
  let dbStatus = "disconnected";
  try {
    const result = await query("SELECT NOW() as now");
    if (result.rows?.[0]?.now) dbStatus = "connected";
  } catch (err) {
    dbStatus = "error: " + err.message;
  }
  res.json({
    status: "ok",
    db: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use("/api/auth", authRouter);
app.use("/api", authRouter);
app.use("/api", clinicRouter);

// Fallback 404 for unknown API endpoints
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  next();
});

export default app;

