import { createTunnel, removeTunnel } from "../tunnelManager.js";

export function setupControlWS(wss) {
  wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
      let data;
      try {
        data = JSON.parse(msg.toString());
      } catch {
        return;
      }

      if (data.type === "register") {
        const id = createTunnel(ws, data.localPort);
        ws.send(JSON.stringify({
          type: "registered",
          id
        }));
      }

      if (data.type === "http_response") {
        ws.emit(`response:${data.requestId}`, data);
      }
    });

    ws.on("close", () => removeTunnel(ws));
  });
}
