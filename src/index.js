import { createServer } from "./server.js";

const port = process.env.PORT || 10000;
createServer(port);
