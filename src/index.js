import { createServer } from "./server.js";

const port = process.env.PORT || 8080;
createServer(port);
