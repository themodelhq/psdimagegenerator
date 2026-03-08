import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerChatRoutes } from "./chat";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initializeWebSocket } from "../websocket";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => { server.close(() => resolve(true)); });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── CORS ──────────────────────────────────────────────────────────────────
  // Allow the Netlify frontend origin plus localhost for development.
  // Set FRONTEND_URL on Render to your Netlify site URL, e.g.:
  //   https://your-app.netlify.app
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
  ].filter(Boolean) as string[];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Render health checks)
      if (!origin) return callback(null, true);
      if (allowedOrigins.some(o => origin.startsWith(o))) return callback(null, true);
      // Also allow any netlify.app subdomain pattern
      if (/^https:\/\/[^.]+\.netlify\.app$/.test(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie", "x-guest-id"],
  }));

  // ── Body parsers ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: "150mb" }));
  app.use(express.urlencoded({ limit: "150mb", extended: true }));

  // ── Health check (Render needs this) ──────────────────────────────────────
  app.get("/api/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

  // ── Auth / OAuth ──────────────────────────────────────────────────────────
  registerOAuthRoutes(app);
  registerChatRoutes(app);

  // ── WebSocket (Socket.io) ─────────────────────────────────────────────────
  initializeWebSocket(server, {
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
      credentials: true,
    },
  });

  // ── tRPC API ──────────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext, maxBodySize: 150 * 1024 * 1024 })
  );

  // ── Static files / Vite dev ───────────────────────────────────────────────
  // In split-deployment mode the frontend is on Netlify, so the backend only
  // serves static files in the classic single-server (non-split) setup.
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else if (!process.env.FRONTEND_URL) {
    // Single-server production (e.g. Render serving everything)
    serveStatic(app);
  }
  // If FRONTEND_URL is set we're in split mode — no static files to serve.

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
    if (process.env.FRONTEND_URL) {
      console.log(`Split-deployment mode — frontend: ${process.env.FRONTEND_URL}`);
    }
  });
}

startServer().catch(console.error);
