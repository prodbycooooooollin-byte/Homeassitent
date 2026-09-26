import { loadConfig } from './config.js';
import { createLikedServer } from './app.js';

const config = loadConfig();
const server = createLikedServer(config);
await server.listen();

const shutdown = async (signal: string) => {
  server.log.info('shutdown', { reason: signal });
  await server.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
