// index.js
import dotenv from "dotenv";
dotenv.config();
import { createServer } from "./server.js";
import logger from "../utils/logger.js";

const port = process.env.PORT || 8080;

createServer(port).catch((err) => {
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});