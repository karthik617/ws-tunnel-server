import { getTunnel } from "../tunnelManager.js";
import { randomUUID } from "crypto";

function getTunnelId(req) {
    // Production (Render)
    if (process.env.NODE_ENV === "production") {
    //   return req.headers.host.split(".")[0];
        return req.url.split("/")[2]
    }
  
    // Local dev → /tunnel/:id
    return req.url.split("/")[2];
  }

export function setupHttpRelay(app) {
  app.use(async (req, res) => {
    const host = req.headers.host;
    if (!host) return res.sendStatus(400);

    // const subdomain = host.split(".")[0];
    const subdomain = getTunnelId(req);
    const tunnel = getTunnel(subdomain);

    if (!tunnel) {
      return res.status(404).send("Tunnel not found");
    }

    const requestId = randomUUID();

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      tunnel.ws.send(JSON.stringify({
        type: "http_request",
        requestId,
        method: req.method,
        path: req.url,
        headers: req.headers,
        body
      }));
    });

    tunnel.ws.once(`response:${requestId}`, (data) => {
      res.writeHead(data.status || 200, data.headers || {});
      res.end(data.body || "");
    });
  });
}
