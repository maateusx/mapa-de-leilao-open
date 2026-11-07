/**
 * Origem VIP Leilões: vipleiloes.com.br (ASP.NET Razor Pages, sem API JSON).
 * GET /canal → cookie __CBCanal; sem ele toda página redireciona para /canal.
 * POST /pesquisa?handler=pesquisar&pageNumber=N (form Filtro.*) → HTML dos cards,
 * 12 por página (tamanho fixo), total em "<n> resultados encontrados".
 * O card traz título, marca, km, UF, valor atual e inicial; cidade e descrição
 * só existem na página do lote (/evento/anuncio/<slug>-<id>), que não buscamos.
 * Classificação não vem no card: passadas extras com Filtro.Classificacao
 * (1 = Motos, 6 = Pesados) marcam o tipo.
 * Rate limit do Cloudflare: ~10 requisições de rajada e depois ~1 a cada 6 s,
 * 429 sem retry-after. O catálogo todo (~2.400 lotes, ~200 páginas) levaria ~20 min,
 * então buscamos só as procedências de banco/financeira e seguradora (~300 lotes).
 * O grosso de fora é apreensão de DETRAN/prefeitura (~1.500, muita sucata).
 */
import { parseBrl } from './parse.js';
import { toUf, parseVehicle } from './bradesco.js';
import type { PropertyInput } from './sync.js';

const SITE = 'https://www.vipleiloes.com.br';
const PER_PAGE = 12;

// ponytail: só Recuperado Financiamento (4) e Recuperado Sinistro (5); somar 1 (Apreensão),
// 2 (Patrimônio) e 3 (Penhorado) aqui se o limite do site afrouxar.
const PROCEDENCIAS: Record<string, string> = { '4': 'Recuperado Financiamento', '5': 'Recuperado Sinistro' };

type Filtro = { procedencia: string; classificacao?: string };

async function post(cookie: string, page: number, f: Filtro): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${SITE}/pesquisa?handler=pesquisar&pageNumber=${page}`, {
      method: 'POST',
      headers: { 'User-Agent': 'Mozilla/5.0', cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'Filtro.Procedencia': f.procedencia,
        'Filtro.Classificacao': f.classificacao ?? '',
        'Filtro.OrdenarPor': 'DataInicio',
      }),
    });
    if (res.status === 429 && attempt < 10) {
      const wait = Number(res.headers.get('retry-after') ?? 6);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`VIP: HTTP ${res.status} na página ${page}`);
    return res.text();
  }
}

/** Todos os cards de uma busca, página a página. */
async function cards(cookie: string, f: Filtro): Promise<string[]> {
  const all: string[] = [];
  for (let page = 1, total = 1; page <= total; page++) {
    const html = await post(cookie, page, f);
    all.push(...html.split('<div class="card card-lel').slice(1));
    total = Math.ceil(Number(html.match(/(\d+) resultados encontrados/)?.[1] ?? 0) / PER_PAGE);
  }
  return all;
}

const decode = (s: string) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const brl = (s: string | undefined) => parseBrl(s?.replace(/[^\d.,]/g, ''));
const idOf = (card: string) => card.match(/href="\/evento\/anuncio\/[^"]*-(\d+)"/)?.[1];

export async function fetchVip(): Promise<PropertyInput[]> {
  const home = await fetch(`${SITE}/canal`, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'manual' });
  const cookie = home.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  if (!cookie.includes('__CBCanal=%7B')) throw new Error('VIP: cookie __CBCanal não veio');

  const all: [string, string][] = []; // [procedência, card]
  const motos = new Set<string | undefined>();
  const pesados = new Set<string | undefined>();
  for (const [procedencia, label] of Object.entries(PROCEDENCIAS)) {
    all.push(...(await cards(cookie, { procedencia })).map((c): [string, string] => [label, c]));
    for (const id of (await cards(cookie, { procedencia, classificacao: '1' })).map(idOf)) motos.add(id);
    for (const id of (await cards(cookie, { procedencia, classificacao: '6' })).map(idOf)) pesados.add(id);
  }

  const items = new Map<string, PropertyInput>();
  for (const [procedencia, card] of all) {
    const id = idOf(card);
    const status = decode(card.match(/class="situacao">([^<]*)/)?.[1] ?? '');
    const info = [...(card.match(/class="anc-info">(.*?)<\/div>/s)?.[1] ?? '').matchAll(/<span>([^<]*)<\/span>/g)]
      .map((m) => decode(m[1]));
    const brand = info[0] ?? '';
    const state = toUf(card.match(/Local:<\/strong>\s*([A-Z]{2})/)?.[1] ?? null);
    // Sem lance o "valor atual" é o próprio inicial.
    const price = brl(card.match(/class="valor-atual">([^<]*)/)?.[1]) || brl(card.match(/Valor inicial: <b>([^<]*)/)?.[1]);
    if (!id || !state || !price || status === 'Vendido' || /^diversos$/i.test(brand)) continue;

    const name = decode(card.match(/<h1 class="mb-0">([^<]*)/)?.[1] ?? ''); // "BOXER L3CARGO - 2021/2022"
    const km = info.find((s) => /km$/i.test(s))?.replace(/\D/g, '');
    const desc = [...info, procedencia].join(' - ');
    const title = brand ? `${brand.toUpperCase()} - ${name}` : name;
    const link = `${SITE}${card.match(/href="(\/evento\/anuncio\/[^"]+)"/)![1]}`;
    items.set(id, {
      externalId: id,
      kind: 'vehicles',
      title,
      images: [...card.matchAll(/class="crd-image".*?<img[^>]*src="([^"]+)"/gs)].map((m) => m[1]),
      state,
      city: '',
      neighborhood: '',
      address: '',
      price,
      appraisalValue: null, // o site não mostra avaliação nem FIPE
      discount: 0,
      financing: false,
      propertyType: motos.has(id) ? 'Moto' : pesados.has(id) ? 'Pesado' : 'Carro',
      saleModality: status === 'Repasse' ? 'Repasse' : 'Leilão',
      description: desc,
      totalArea: null,
      privateArea: null,
      landArea: null,
      bedrooms: null,
      parkingSpaces: null,
      link,
      ...parseVehicle(title, km ? `Km ${km}` : ''),
    });
  }
  return [...items.values()];
}
