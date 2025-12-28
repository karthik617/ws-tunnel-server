import { getTunnel, getAnyHttpTunnel } from "../tunnelManager.js";
import { randomUUID } from "crypto";
import WebSocket from "ws";
import logger from "../../utils/logger.js";

export function setupHttpRelay(app, server, wss) {

  app.use(async (req, res, next) => {
    if (!req.url.startsWith("/tunnel")) {
      const activeTunnel = await getAnyHttpTunnel();
      if (activeTunnel) {
        req.url = `/tunnel/${activeTunnel.id}${req.url}`;
        logger.debug('Auto-routing to tunnel', { 
          tunnelId: activeTunnel.id,
          originalUrl: req.url 
        });
      }
    }
    next();
  });
  
  app.use(async (req, res) => {
    const parts = req.url.split("/").filter(Boolean);
    
    logger.info('HTTP request received', { 
      url: req.url, 
      method: req.method,
      ip: req.socket.remoteAddress
    });

    if (parts[0] !== "tunnel" || parts.length < 2) {
      logger.warn('Invalid tunnel URL', { url: req.url });
      return res.sendStatus(404);
    }

    const tunnelId = parts[1];
    const tunnel = await getTunnel(tunnelId);
    
    if (!tunnel) {
      logger.warn('Tunnel not found', { tunnelId });
      return res.status(404).send("Tunnel not found");
    }
    // const forwardPath = "/" + parts.slice(2).join("/") + (req._parsedUrl?.search || "");
    const forwardPath = "/" + parts.slice(2).join("/");
    const requestId = randomUUID();

    logger.debug('Forwarding HTTP request', { 
      tunnelId, 
      requestId, 
      path: forwardPath 
    });

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

  server.on("upgrade", async (req, socket, head) => {
    const parts = req.url.split("/").filter(Boolean);
    
    if (parts[0] === "tunnel" && parts.length >= 2) {
      const tunnelId = parts[1];
      
      logger.info('WebSocket upgrade - Tunnel forwarding', { 
        tunnelId, 
        url: req.url 
      });
      
      const tunnel = await getTunnel(tunnelId);
      
      if (!tunnel || tunnel.type !== "http") {
        logger.warn('Tunnel not found for WebSocket', { tunnelId });
        return socket.destroy();
      }

      const wsPath = "/" + parts.slice(2).join("/");

      const localWs = new WebSocket(`ws://localhost:${tunnel.localPort}${wsPath}`, {
        headers: { ...req.headers, host: undefined }
      });

      localWs.on("open", () => {
        logger.debug('WebSocket tunnel established', { tunnelId, wsPath });
        socket.write("HTTP/1.1 101 Switching Protocols\r\n\r\n");
        localWs._socket.pipe(socket);
        socket.pipe(localWs._socket);
      });

      localWs.on("error", (err) => {
        logger.error('WebSocket tunnel error', { 
          tunnelId, 
          error: err.message 
        });
        socket.destroy();
      });

      if (head && head.length) localWs._socket.write(head);
    } 
    else {
      logger.info('WebSocket upgrade - Control', { url: req.url });
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });
}