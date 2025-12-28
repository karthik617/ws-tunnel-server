import { getTunnel } from "../tunnelManager.js";
import { randomUUID } from "crypto";
import WebSocket from "ws";

export function setupHttpRelay(app, server) {
  // Forward normal HTTP requests
  app.use((req, res) => {
    const parts = req.url.split("/").filter(Boolean);

    // Expect /tunnel/:id/*
    if (parts[0] !== "tunnel" || parts.length < 2) {
      return res.sendStatus(404);
    }

    const tunnelId = parts[1];
    const tunnel = getTunnel(tunnelId);
    if (!tunnel) return res.status(404).send("Tunnel not found");

    // Strip /tunnel/<id> from path
    const forwardPath = "/" + parts.slice(2).join("/") + (req._parsedUrl?.search || "");

    const requestId = randomUUID();
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      tunnel.pending.set(requestId, res);
      tunnel.ws.send(
        JSON.stringify({
          type: "http_request",
          requestId,
          method: req.method,
          path: forwardPath || "/",
          headers: req.headers,
          body,
        })
      );
    });
  });

  // Forward WebSocket upgrades (for Vite HMR)
  server.on("upgrade", (req, socket, head) => {
    const parts = req.url.split("/").filter(Boolean);
    if (parts[0] !== "tunnel" || parts.length < 2) {
      socket.destroy();
      return;
    }

    const tunnelId = parts[1];
    const tunnel = getTunnel(tunnelId);
    if (!tunnel || tunnel.type !== "http") {
      socket.destroy();
      return;
    }

    // Connect to local WebSocket server (Vite HMR)
    const localWs = new WebSocket(`ws://localhost:${tunnel.localPort}${"/" + parts.slice(2).join("/")}`, {
      headers: req.headers
    });

    localWs.on("open", () => {
      socket.write("HTTP/1.1 101 Switching Protocols\r\n\r\n");
      localWs._socket.pipe(socket);
      socket.pipe(localWs._socket);
    });

    localWs.on("error", () => socket.destroy());
  });
}
