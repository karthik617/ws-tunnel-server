import { getTunnel } from "../tunnelManager.js";
import { randomUUID } from "crypto";



export function setupHttpRelay(app) {
  app.use(async (req, res) => {
    const host = req.headers.host;
    if (!host) return res.sendStatus(400);

    const parts = req.url.split("/").filter(Boolean);

    // Expect /tunnel/:id/*
    if (parts[0] !== "tunnel" || parts.length < 2) {
      return res.sendStatus(404);
    }

    const tunnelId = parts[1];
    const tunnel = getTunnel(tunnelId);

    if (!tunnel) {
      return res.status(404).send("Tunnel not found");
    }
    const forwardPath ="/" + parts.slice(2).join("/") + (req._parsedUrl.search || "");
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
}
