import type { FastifyInstance } from 'fastify';
import { SyncRun } from '../models/SyncRun.js';
import { CAIXA_UFS, caixaCsvUrl } from '../lib/caixa.js';
import { SOURCES, runSync } from '../lib/sync.js';
import { ORIGINS } from '../config.js';

export async function syncRoutes(app: FastifyInstance) {
  // CSV enviado como corpo cru (escopo só deste plugin).
  app.addContentTypeParser(
    ['text/csv', 'application/octet-stream'],
    { parseAs: 'buffer', bodyLimit: 50 * 1024 * 1024 },
    (_req, body, done) => done(null, body)
  );

  app.get('/api/sync', async () => ({
    origins: Object.keys(SOURCES).map((key) => ({ key, name: ORIGINS[key]?.name ?? key })),
    runs: await SyncRun.find().sort({ createdAt: -1 }).limit(30).lean(),
    links: [
      { uf: 'Todos', url: caixaCsvUrl('geral') },
      ...CAIXA_UFS.map((uf) => ({ uf, url: caixaCsvUrl(uf) })),
    ],
  }));

  // Sincroniza uma origem agora (padrão: caixa).
  app.post<{ Querystring: { origin?: string } }>('/api/sync/run', async (req, reply) => {
    const origin = req.query.origin ?? 'caixa';
    if (!SOURCES[origin]) return reply.code(400).send({ error: `Origem desconhecida: ${origin}` });
    return runSync(origin);
  });

  // Upload manual de um CSV da Caixa baixado no navegador.
  app.post<{ Querystring: { file?: string } }>('/api/sync/upload', async (req, reply) => {
    if (!Buffer.isBuffer(req.body)) return reply.code(400).send({ error: 'Envie o CSV no corpo.' });
    return runSync('caixa', { buffer: req.body, file: req.query.file ?? 'upload.csv' });
  });
}
