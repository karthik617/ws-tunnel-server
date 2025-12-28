import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { setupControlWS } from "./ws/control.js";
import { setupHttpRelay } from "./ws/httpRelay.js";

export function createServer(port) {
  const app = express();
  const server = http.createServer(app);

  const wss = new WebSocketServer({ server });

  setupControlWS(wss);
  setupHttpRelay(app);

  app.get("/", (_, res) => {
    res.send("🚇 Tunnel server running");
  });

  server.listen(port, () => {
    console.log(`🚀 Tunnel server listening on port ${port}`);
  });
}
