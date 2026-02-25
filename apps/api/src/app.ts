import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import coachesRoutes from "./routes/coaches.js";
import bookingsRoutes from "./routes/bookings.js";
import { stripeWebhookHandler } from "./routes/webhooks.js";
import { prisma } from "./db.js";

const app = express();

// CORS: allow frontend origins (must match API Gateway httpApi.cors.allowedOrigins)
const allowedOrigins = [
  "https://d36rrgq6wyjuf8.cloudfront.net",
  "http://localhost:5173",
  "http://localhost:3000",
];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Dev-User-Id"],
  })
);

// Stripe webhook needs raw body for signature verification
app.use("/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookHandler);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Health DB check failed:", message);
    res.status(503).json({ status: "error", database: "disconnected", detail: message });
  }
});

app.use("/auth", authRoutes);
app.use("/coaches", coachesRoutes);
app.use("/bookings", bookingsRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error("Unhandled error:", message, stack ?? "");
  res.status(500).json({
    error: "Internal server error",
    detail: message,
    ...(process.env.NODE_ENV !== "production" && stack && { stack }),
  });
});

export default app;
