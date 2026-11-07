/**
 * Sync genérico: cada origem só sabe buscar e normalizar seus imóveis
 * (ver SOURCES); gravar no Mongo, limpar os que saíram e registrar o histórico
 * fica aqui.
 */
import { Property } from '../models/Property.js';
import { SyncRun } from '../models/SyncRun.js';
import { fetchCaixa, parseCaixaCsv } from './caixa.js';
import { fetchBradesco } from './bradesco.js';
import { fetchSantander } from './santander.js';
import { fetchBb } from './bb.js';
import { fetchEmgea } from './emgea.js';
import { fetchInter } from './inter.js';
import { fetchBanrisul } from './banrisul.js';
import { fetchSicredi } from './sicredi.js';
import { fetchFreitas } from './freitas.js';
import { fetchSuperbid } from './superbid.js';
import { fetchSpu } from './spu.js';
import { fetchReceita } from './receita.js';
import { fetchLancenoleilao } from './lancenoleilao.js';
import { fetchResale } from './resale.js';
import { fetchMega } from './mega.js';
import { fetchZuk } from './zuk.js';
import { fetchVip } from './vip.js';

/** Imóvel normalizado (campos do model Property, sem `origin`). */
export type PropertyInput = { externalId: string; state: string; [field: string]: unknown };

/** Para adicionar uma origem: registre-a em config.ts (ORIGINS) e aqui. */
export const SOURCES: Record<string, () => Promise<PropertyInput[]>> = {
  caixa: fetchCaixa,
  bradesco: fetchBradesco,
  santander: fetchSantander,
  bb: fetchBb,
  emgea: fetchEmgea,
  inter: fetchInter,
  banrisul: fetchBanrisul,
  sicredi: fetchSicredi,
  freitas: fetchFreitas,
  superbid: fetchSuperbid,
  spu: fetchSpu,
  receita: fetchReceita,
  lancenoleilao: fetchLancenoleilao,
  resale: fetchResale,
  mega: fetchMega,
  zuk: fetchZuk,
  vip: fetchVip,
};

export async function upsertProperties(origin: string, items: PropertyInput[]) {
  if (items.length === 0) throw new Error('Nenhum imóvel válido encontrado.');
  const states = [...new Set(items.map((i) => i.state))];

  // Limpeza só nas UFs presentes (upload de RJ não apaga SP).
  // Se veio bem menos imóveis que o banco, provavelmente veio cortado: não apaga.
  const scope = { origin, state: { $in: states } };
  const existing = await Property.countDocuments(scope);

  const ops = items.map((item) => ({
    updateOne: {
      filter: { origin, externalId: item.externalId },
      update: { $set: { ...item, origin } },
      upsert: true,
    },
  }));
  for (let i = 0; i < ops.length; i += 1000) {
    await Property.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
  }

  let removed = 0;
  if (items.length >= existing * 0.5) {
    const ids = items.map((i) => i.externalId);
    ({ deletedCount: removed } = await Property.deleteMany({ ...scope, externalId: { $nin: ids } }));
  }
  return { imported: items.length, removed, states: states.sort() };
}

// ponytail: trava em memória, vale para um único processo do servidor.
const running = new Set<string>();

/** Executa o sync de uma origem e registra no histórico. Upload só existe para a Caixa. */
export async function runSync(origin: string, upload?: { buffer: Buffer; file: string }) {
  const fetchItems = SOURCES[origin];
  if (!fetchItems) throw new Error(`Origem desconhecida: ${origin}`);
  if (running.has(origin)) throw new Error('Já existe uma sincronização desta origem em andamento.');
  running.add(origin);
  const run = await SyncRun.create({
    origin,
    source: upload ? 'upload' : 'auto',
    file: upload?.file ?? '',
  });
  try {
    const items = upload ? parseCaixaCsv(upload.buffer) : await fetchItems();
    Object.assign(run, await upsertProperties(origin, items), { status: 'ok' });
  } catch (err) {
    run.status = 'error';
    run.error = err instanceof Error ? err.message : String(err);
  } finally {
    run.finishedAt = new Date();
    await run.save();
    running.delete(origin);
  }
  return run.toObject();
}

const DAY = 24 * 60 * 60 * 1000;

/** Tenta o sync automático de cada origem 1x por dia (checa de hora em hora). */
export function scheduleDailySync(log: (msg: string) => void) {
  const tick = async () => {
    for (const origin of Object.keys(SOURCES)) {
      const last = await SyncRun.findOne({ origin, source: 'auto' }).sort({ createdAt: -1 });
      if (last && Date.now() - last.createdAt.getTime() < DAY) continue;
      const run = await runSync(origin).catch((e) => ({ status: 'error', error: String(e) }));
      log(`Sync diário (${origin}): ${run.status}${run.error ? ` — ${run.error}` : ''}`);
    }
  };
  tick();
  setInterval(tick, 60 * 60 * 1000).unref();
}
