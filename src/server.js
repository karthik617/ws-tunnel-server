// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { setupControlWS } from "./ws/control.js";
import { setupHttpRelay } from "./ws/httpRelay.js";

export function createServer(port) {
  const app = express();
  const server = http.createServer(app);

  // Use noServer: true so we can manually route upgrades
  const wss = new WebSocketServer({ noServer: true });

  setupControlWS(wss);
  setupHttpRelay(app, server, wss); // Pass wss so httpRelay knows about it

  app.get("/", (_, res) => {
    res.send("🚇 Tunnel server running");
  });

  server.listen(port, () => {
    console.log(`🚀 Tunnel server listening on port ${port}`);
  });
}