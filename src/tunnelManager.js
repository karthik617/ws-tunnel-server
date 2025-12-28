import { v4 as uuid } from "uuid";
import { getRedisClient } from "../utils/redis.js";
import logger from "../utils/logger.js";

// In-memory WebSocket connections (can't store in Redis)
const wsConnections = new Map();

const TUNNEL_PREFIX = 'tunnel:';
const TUNNEL_TTL = 3600; // 1 hour

// Helper to get tunnel key
function getTunnelKey(id) {
  return `${TUNNEL_PREFIX}${id}`;
}

export async function createTunnel(ws, localPort) {
  const id = uuid().slice(0, 6);
  const redis = await getRedisClient();
  
  const tunnelData = {
    id,
    localPort,
    type: "http",
    createdAt: Date.now()
  };

  // Store tunnel metadata in Redis
  await redis.setEx(
    getTunnelKey(id),
    TUNNEL_TTL,
    JSON.stringify(tunnelData)
  );

  // Store WebSocket connection in memory (can't serialize WebSocket)
  wsConnections.set(id, {
    ws,
    pending: new Map() // pending requests
  });

  logger.info('Tunnel created', { tunnelId: id, localPort });
  
  return id;
}

export async function getTunnel(id) {
  const redis = await getRedisClient();
  
  // Get metadata from Redis
  const data = await redis.get(getTunnelKey(id));
  if (!data) {
    logger.warn('Tunnel not found', { tunnelId: id });
    return null;
  }

  const tunnelData = JSON.parse(data);
  
  // Get WebSocket connection from memory
  const wsData = wsConnections.get(id);
  if (!wsData) {
    logger.warn('Tunnel WebSocket not found', { tunnelId: id });
    return null;
  }

  return {
    ...tunnelData,
    ws: wsData.ws,
    pending: wsData.pending
  };
}

export async function removeTunnel(ws) {
  // Find tunnel ID by WebSocket
  let tunnelId = null;
  for (const [id, data] of wsConnections.entries()) {
    if (data.ws === ws) {
      tunnelId = id;
      break;
    }
  }

  if (!tunnelId) {
    logger.warn('Tunnel not found for removal');
    return;
  }

  const redis = await getRedisClient();
  
  // Remove from Redis
  await redis.del(getTunnelKey(tunnelId));
  
  // Remove from memory
  wsConnections.delete(tunnelId);
  
  logger.info('Tunnel removed', { tunnelId });
}

export async function getAnyHttpTunnel() {
  const redis = await getRedisClient();
  
  // Get all tunnel keys
  const keys = await redis.keys(`${TUNNEL_PREFIX}*`);
  
  if (keys.length === 0) {
    logger.debug('No active tunnels found');
    return null;
  }

  // Get first tunnel
  const data = await redis.get(keys[0]);
  if (!data) return null;

  const tunnel = JSON.parse(data);
  
  // Check if WebSocket still exists
  const wsData = wsConnections.get(tunnel.id);
  if (!wsData) {
    // Clean up stale tunnel
    await redis.del(keys[0]);
    return getAnyHttpTunnel(); // Recursive retry
  }

  logger.debug('Found active tunnel', { tunnelId: tunnel.id });
  
  return {
    ...tunnel,
    ws: wsData.ws,
    pending: wsData.pending
  };
}

// Cleanup expired tunnels periodically
export async function cleanupExpiredTunnels() {
  const redis = await getRedisClient();
  const keys = await redis.keys(`${TUNNEL_PREFIX}*`);
  
  let cleaned = 0;
  for (const key of keys) {
    const data = await redis.get(key);
    if (!data) continue;
    
    const tunnel = JSON.parse(data);
    const wsData = wsConnections.get(tunnel.id);
    
    // If WebSocket doesn't exist, remove tunnel
    if (!wsData || wsData.ws.readyState !== 1) {
      await redis.del(key);
      wsConnections.delete(tunnel.id);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.info('Cleaned up expired tunnels', { count: cleaned });
  }
}