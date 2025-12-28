import { createTunnel, removeTunnel, getTunnel } from "../tunnelManager.js";

export function setupControlWS(wss) {
  let tunnelId = null;
  wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
      let data;
      try {
        data = JSON.parse(msg.toString());
      } catch {
        return;
      }

      if (data.type === "register") {
        tunnelId = createTunnel(ws, data.localPort);
        console.log(`🚇 Tunnel ${tunnelId} registered on port ${data.localPort}`);
        ws.send(JSON.stringify({
          type: "registered",
          id: tunnelId
        }));
      }

      if (data.type === "http_response") {
        if (!tunnelId) return;
        const tunnel = getTunnel(tunnelId);
        if (!tunnel) return;
        const res = tunnel.pending.get(data.requestId);
        if (!res) return;
        res.writeHead(data.status || 200, data.headers || {});
        res.end(data.body || "");

        tunnel.pending.delete(data.requestId);
      }
    });
    ws.on("close", () => removeTunnel(ws));
    ws.on("error", () => removeTunnel(ws));
  });
}
