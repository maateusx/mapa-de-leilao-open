/**
 * Origem Freitas Leiloeiro: freitasleiloeiro.com.br (ASP.NET MVC, HTML parcial via jQuery).
 * GET /Leiloes/PesquisarLotesTipos?categoria=C → [{ subTipoId, nome, quantidade }]
 *   categorias: 1 = veículos, 2 = imóveis, 3 = materiais (bens diversos).
 * GET /Leiloes/PesquisarLotes?Categoria=C&TipoLoteId=S&PageNumber=N&TopRows=200
 *   → HTML com os cards dos lotes (1-based); acabou quando vem < 200 cards.
 * O card traz lote, foto, descrição, valor (maior lance ou lance inicial) e, nos imóveis, "CIDADE/UF".
 * Veículos e bens não trazem local: pega a "Visitação/Retirada" de um lote por leilão
 * (GET /Leiloes/LoteDetalhes?leilaoId=X&loteNumero=Y). Na prática são os pátios da Grande SP.
 * Dos materiais (mochilas, roupas, celulares...) só entram máquinas, barcos e aeronaves.
 * Avaliação só nos imóveis de alienação fiduciária (lance do 1º leilão); nos demais, desconto 0. Sem limite documentado; 429 tratado como no Bradesco.
 */
import { parseBrl } from './parse.js';
import { parseVehicle, toUf } from './bradesco.js';
import type { PropertyInput } from './sync.js';

const SITE = 'https://www.freitasleiloeiro.com.br';
const PER_PAGE = 200;

async function get(path: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(SITE + path, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? 60);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Freitas: HTTP ${res.status} em ${path}`);
    return res;
  }
}

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, '').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const field = (card: string, cls: string) => decode(card.match(new RegExp(`class="${cls}[^"]*">(.*?)</div>`, 's'))?.[1] ?? '');

const lotId = (card: string) => card.match(/leilaoId=(\d+)&(?:amp;)?loteNumero=(\d+)/)?.slice(1) ?? [];

/** Tipo de lote dos materiais → KINDS; o resto dos materiais fica de fora. */
function materialKind(name: string) {
  if (/embarca|barco|lancha|jet/i.test(name)) return 'boat';
  if (/aeronave|avi[aã]o|helic/i.test(name)) return 'aircraft';
  if (/m[aá]quina|equipamento|trator|empilhadeira/i.test(name)) return 'equipments';
  return null;
}

/** "...AV. DOS ESTADOS, 584 - PORTÃO 2 UTINGA - SANTO ANDRE/SP" → ["SANTO ANDRE", "SP"] */
const cityUf = (s: string) => {
  const m = s.match(/([^-,.(]+)\/([A-Z]{2})\b(?!.*\/[A-Z]{2}\b)/);
  return m ? [m[1].trim(), m[2]] : ['', ''];
};

// Siglas do Detran no começo da descrição ("CHEV/ONIX", "I/LR EVOQUE"...).
const BRANDS: Record<string, string> = {
  CHEV: 'Chevrolet', 'M.BENZ': 'Mercedes-Benz', LR: 'Land Rover', MMC: 'Mitsubishi', CAOACHERY: 'Caoa Chery',
};

/** "I/LR EVOQUE PRESTIGE, 11/12, PLACA: G__-___7, GAS/ELETR, PRETA" → campos de veículo. */
function vehicle(desc: string) {
  const [head, years = ''] = desc.split(', ');
  const name = head.replace(/^I\//, ''); // I/ = importado
  const [brand, ...model] = name.includes('/') ? name.split('/') : name.split(' ');
  const [fab, mod] = years.split('/').map((y) => (y.length === 2 ? `20${y}` : y));
  const title = [BRANDS[brand] ?? brand, model.join(' ').trim(), fab && mod ? `${fab} / ${mod}` : ''].join(' - ');
  // Combustível no padrão do Detran → termos que o parseVehicle reconhece.
  const normalized = desc.replace(/GASOL\/ALC/i, 'Flex').replace(/GAS\/ELETR/i, 'Híbrido');
  return parseVehicle(title, normalized);
}

export async function fetchFreitas(): Promise<PropertyInput[]> {
  const lots: { card: string; kind: string; type: string }[] = [];
  for (const categoria of [1, 2, 3]) {
    const types: { subTipoId: number; nome: string }[] = await (await get(`/Leiloes/PesquisarLotesTipos?categoria=${categoria}`)).json();
    for (const t of types) {
      const kind = categoria === 1 ? 'vehicles' : categoria === 2 ? 'realstate' : materialKind(t.nome);
      if (!kind) continue;
      for (let page = 1; ; page++) {
        const html = await (await get(`/Leiloes/PesquisarLotes?Categoria=${categoria}&TipoLoteId=${t.subTipoId}&PageNumber=${page}&TopRows=${PER_PAGE}`)).text();
        const cards = html.split('<div class="cardlote">').slice(1);
        lots.push(...cards.map((card) => ({ card, kind, type: t.nome })));
        if (cards.length < PER_PAGE) break;
      }
    }
  }

  // Local de veículos/bens: um lote por leilão.
  // ponytail: assume que todo o leilão está no mesmo pátio; buscar lote a lote se isso mudar.
  const places = new Map<string, string[]>();
  for (const { card, kind } of lots) {
    const [id, lote] = lotId(card);
    if (kind === 'realstate' || !id || places.has(id)) continue;
    const html = await (await get(`/Leiloes/LoteDetalhes?leilaoId=${id}&loteNumero=${lote}`)).text();
    const where = html.match(/Visita[^<]*Retirada:<\/span>([^<]*)/)?.[1] ?? html.match(/Local de retirada[^:]*:([^<]*)/)?.[1] ?? '';
    places.set(id, cityUf(decode(where)));
  }

  const items: PropertyInput[] = [];
  for (const { card, kind, type } of lots) {
    const [leilaoId, lote] = lotId(card);
    const price = parseBrl(field(card, 'cardLote-vlr').replace(/[^\d.,]/g, ''));
    const desc = field(card, 'cardLote-desc(?:Veic|Bens)');
    const details = field(card, 'cardLote-details(?=")');
    // Imóvel: "CIDADE/UF" no card; no de alienação fiduciária só na descrição ("São Paulo-SP. Bairro...").
    const [city, uf] = kind !== 'realstate' ? places.get(leilaoId) ?? ['', '']
      : details ? cityUf(details) : desc.match(/^([^./]+?)[-/]([A-Z]{2})\b/)?.slice(1) ?? cityUf(desc);
    const state = toUf(uf);
    if (!leilaoId || !state || !price) continue;
    // Alienação fiduciária: card com 1º e 2º leilão. O lance do 1º não pode ser menor que a
    // avaliação, então vira a referência do desconto (mesma regra do Bradesco).
    const praças = [...card.matchAll(/cardLote-details-af-valor[^"]*">\s*R\$\s*([\d.,]+)/g)].map((m) => parseBrl(m[1]));
    const reference = praças.length > 1 && praças[0]! > price ? praças[0] : null;
    items.push({
      externalId: `${leilaoId}-${lote}`,
      kind,
      title: kind === 'realstate' ? `${type} - ${city}/${state}` : desc.split(', PLACA')[0],
      images: [card.match(/<img src="([^"]+\/FOTOS\/[^"]+)"/)?.[1]].filter(Boolean) as string[],
      state,
      city,
      neighborhood: '',
      address: '',
      price,
      appraisalValue: reference,
      discount: reference ? Math.round((1 - price / reference) * 10000) / 100 : 0,
      financing: false,
      propertyType: type,
      // "FINANCEIRA", "SEGURADORA SINISTRO/MÉDIA MONTA"; nos imóveis o card só repete a cidade.
      saleModality: praças.length ? 'Leilão - Alienação Fiduciária' : kind === 'realstate' ? 'Leilão' : details || 'Leilão',
      description: desc,
      totalArea: null,
      privateArea: null,
      landArea: null,
      bedrooms: null,
      parkingSpaces: null,
      link: `${SITE}/Leiloes/LoteDetalhes?leilaoId=${leilaoId}&loteNumero=${lote}`,
      ...(kind === 'vehicles' ? vehicle(desc) : {}),
    });
  }
  return items;
}
