/**
 * Importa imóveis de uma origem pela linha de comando.
 *
 * Uso: npm run import -- <origem>                (ex.: caixa, bradesco)
 *      npm run import -- caixa <caminho-do-csv>  (CSV local da Caixa)
 */
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { connectDb, disconnectDb } from '../src/db.js';
import { runSync } from '../src/lib/sync.js';

const [origin = 'caixa', file] = process.argv.slice(2);
await connectDb();
const run = await runSync(
  origin,
  file ? { buffer: readFileSync(resolve(file)), file: basename(file) } : undefined
);
console.log(run.status === 'ok'
  ? `OK (${origin}): ${run.imported} importados, ${run.removed} removidos (${run.states.join(', ')})`
  : `Erro (${origin}): ${run.error}`);
await disconnectDb();
process.exit(run.status === 'ok' ? 0 : 1);
