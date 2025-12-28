// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { setupControlWS } from "./ws/control.js";
import { setupHttpRelay } from "./ws/httpRelay.js";
import { getRedisClient, closeRedis } from "../utils/redis.js";
import { cleanupExpiredTunnels } from "./tunnelManager.js";
import logger from "../utils/logger.js";

export async function createServer(port) {
  const app = express();
  const server = http.createServer(app);

  // Initialize Redis
  try {
    await getRedisClient();
    logger.info('Redis initialized successfully');
  } catch (err) {
    logger.error('Failed to initialize Redis', { error: err.message });
    process.exit(1);
  }

  const wss = new WebSocketServer({ noServer: true });

  setupControlWS(wss);
  setupHttpRelay(app, server, wss);

  app.get("/", (_, res) => {
    res.send("🚇 Tunnel server running");
  });

  // Cleanup expired tunnels every 5 minutes
  setInterval(() => {
    cleanupExpiredTunnels().catch(err => {
      logger.error('Cleanup error', { error: err.message });
    });
  }, 5 * 60 * 1000);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      closeRedis().then(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
  });

  server.listen(port, () => {
    logger.info('Tunnel server started', { port });
  });
}