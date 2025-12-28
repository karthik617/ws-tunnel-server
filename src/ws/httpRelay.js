import { getTunnel, getAnyHttpTunnel } from "../tunnelManager.js";
import { randomUUID } from "crypto";
import WebSocket from "ws";

export function setupHttpRelay(app, server, wss) {

  app.use((req, res, next) => {
    if (!req.url.startsWith("/tunnel")) {
      const activeTunnel = getAnyHttpTunnel();
      if (activeTunnel) {
        req.url = `/tunnel/${activeTunnel.id}${req.url}`;
      }
    }
    next();
  });
  
  app.use((req, res) => {
    const parts = req.url.split("/").filter(Boolean);
    if (parts[0] !== "tunnel" || parts.length < 2) return res.sendStatus(404);

    const tunnelId = parts[1];
    const tunnel = getTunnel(tunnelId);
    if (!tunnel) return res.status(404).send("Tunnel not found");

    const forwardPath = "/" + parts.slice(2).join("/") + (req._parsedUrl?.search || "");
    const requestId = randomUUID();

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      tunnel.pending.set(requestId, res);
      tunnel.ws.send(JSON.stringify({
        type: "http_request",
        requestId,
        method: req.method,
        path: forwardPath || "/",
        headers: { ...req.headers, host: undefined },
        body
      }));
    });
  });

  // Handle ALL WebSocket upgrades and route them
  server.on("upgrade", (req, socket, head) => {
    const parts = req.url.split("/").filter(Boolean);
    
    // If it's a tunnel forwarding WebSocket
    if (parts[0] === "tunnel" && parts.length >= 2) {
      console.log("🚇 WebSocket upgrade - Tunnel forwarding");
      console.log(req.url);
      
      const tunnelId = parts[1];
      const tunnel = getTunnel(tunnelId);
      if (!tunnel || tunnel.type !== "http") return socket.destroy();

      const wsPath = "/" + parts.slice(2).join("/");

      const localWs = new WebSocket(`ws://localhost:${tunnel.localPort}${wsPath}`, {
        headers: { ...req.headers, host: undefined }
      });

      localWs.on("open", () => {
        socket.write("HTTP/1.1 101 Switching Protocols\r\n\r\n");
        localWs._socket.pipe(socket);
        socket.pipe(localWs._socket);
      });

      localWs.on("error", () => socket.destroy());

      if (head && head.length) localWs._socket.write(head);
    } 
    // Otherwise it's a control WebSocket (tunnel registration)
    else {
      console.log("🚇 WebSocket upgrade - Control");
      console.log(req.url);
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });
}