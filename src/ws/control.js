import { createTunnel, removeTunnel, getTunnel } from "../tunnelManager.js";
import logger from "../../utils/logger.js";

export function setupControlWS(wss) {
  wss.on("connection", (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    logger.info('Control WebSocket connected', { clientIp });
    
    let tunnelId = null;

    ws.on("message", async (msg) => {
      let data;
      try {
        data = JSON.parse(msg.toString());
      } catch (err) {
        logger.warn('Invalid JSON message', { error: err.message });
        return;
      }

      if (data.type === "register") {
        tunnelId = await createTunnel(ws, data.localPort);
        logger.info('Tunnel registered', { 
          tunnelId, 
          localPort: data.localPort,
          clientIp 
        });
        
        ws.send(JSON.stringify({
          type: "registered",
          id: tunnelId
        }));
      }

      if (data.type === "http_response") {
        if (!tunnelId) {
          logger.warn('HTTP response without tunnel ID');
          return;
        }
        
        const tunnel = await getTunnel(tunnelId);
        if (!tunnel) {
          logger.warn('Tunnel not found for response', { tunnelId });
          return;
        }
        
        const res = tunnel.pending.get(data.requestId);
        if (!res) {
          logger.warn('Pending request not found', { 
            tunnelId, 
            requestId: data.requestId 
          });
          return;
        }
        
        res.writeHead(data.status || 200, data.headers || {});
        res.end(data.body || "");
        tunnel.pending.delete(data.requestId);
        
        logger.debug('HTTP response sent', { 
          tunnelId, 
          requestId: data.requestId,
          status: data.status 
        });
      }
    });

    ws.on("close", async () => {
      logger.info('Control WebSocket closed', { tunnelId, clientIp });
      await removeTunnel(ws);
    });

    ws.on("error", async (err) => {
      logger.error('Control WebSocket error', { 
        tunnelId, 
        clientIp, 
        error: err.message 
      });
      await removeTunnel(ws);
    });
  });
}