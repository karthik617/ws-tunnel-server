import { v4 as uuid } from "uuid";

const tunnels = new Map();
/*
  id => {
    ws,
    localPort,
    type,
    pending: MAP<requestId, res>
  }
*/

export function createTunnel(ws, localPort) {
  const id = uuid().slice(0, 6);
  tunnels.set(id, { ws, localPort, type: "http" , pending: new Map()});
  return id;
}

export function getTunnel(id) {
  return tunnels.get(id);
}

export function removeTunnel(ws) {
  for (const [id, tunnel] of tunnels.entries()) {
    if (tunnel.ws === ws)  {
      tunnels.delete(id) 
      break
    }
  }
}
