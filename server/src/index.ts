import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { connectDb } from './db.js';
import { propertyRoutes } from './routes/properties.js';
import { syncRoutes } from './routes/sync.js';
import { scheduleDailySync } from './lib/sync.js';
import { scheduleGeocoding } from './lib/geo.js';

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: config.corsOrigin });

  app.get('/health', async () => ({ status: 'ok' }));
  await app.register(propertyRoutes);
  await app.register(syncRoutes);

  await connectDb();
  app.log.info('MongoDB conectado');

  await app.listen({ port: config.port, host: config.host });
  scheduleDailySync((msg) => app.log.info(msg));
  scheduleGeocoding((msg) => app.log.info(msg));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
