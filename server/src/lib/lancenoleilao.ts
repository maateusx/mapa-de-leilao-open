/**
 * Origem Lance no Leilão: lancenoleilao.com.br (PHP, HTML em ISO-8859-1, sem API JSON).
 * GET / → cards dos leilões ativos (idLeilao + comitente: quase tudo Banco do Brasil,
 *   mais algumas varas/anexos fiscais com leilões judiciais).
 * GET /leilao.php?idLeilao=N&pagina=-1&action=0&todos=1 → todos os lotes do leilão numa página
 *   (título do leilão no <h1>; card com fotos, categoria, "Inicial" e "2ª Praça").
 * O card não traz cidade/UF, só a página do lote: GET /lote.php?idLote=N
 *   ("Localização do bem", "Lance Mínimo" vigente e "Avaliação" nos judiciais).
 * Lotes de venda direta (loteVendaDireta.php) são "faça sua oferta", sem preço: ficam de fora.
 * Catálogo pequeno (~550 lotes, ~250 com preço); sem rate limit visto, 429 tratado como no Bradesco.
 */
import { parseBrl } from './parse.js';
import { parseVehicle, toUf } from './bradesco.js';
import type { PropertyInput } from './sync.js';

const SITE = 'https://www.lancenoleilao.com.br';

async function get(path: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(SITE + path, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? 60);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Lance no Leilão: HTTP ${res.status} em ${path}`);
    return new TextDecoder('latin1').decode(await res.arrayBuffer());
  }
}

const decode = (s: string) =>
  s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const brl = (s: string | undefined) => parseBrl(s?.replace(/[^\d.,]/g, ''));
/** Valor ao lado do rótulo na página do lote: "Lance Mínimo:</span>...R$ 1.800,00". */
const field = (page: string, label: string) => brl(page.match(new RegExp(`${label}:</span>.*?R\\$\\s*([\\d.,]+)`, 's'))?.[1]);
const area = (desc: string, re: RegExp) => parseBrl(desc.match(re)?.[1]);

const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const TYPE_RE = /\b(casa|apartamento|terreno|lote|sala|loja|galp[aã]o|pr[eé]dio|fazenda|ch[aá]cara|s[ií]tio|gleba|im[oó]vel rural)\b/i;
const title = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

export async function fetchLancenoleilao(): Promise<PropertyInput[]> {
  const home = await get('/');
  // Comitente por leilão, a partir dos cards da home.
  const auctions = new Map<string, string>();
  for (const card of home.split('class="card card-1"').slice(1)) {
    const id = card.match(/leilao\.php\?idLeilao=(\d+)/)?.[1];
    if (id) auctions.set(id, card.match(/col-8[^>]*small">\s*([^<]*?)\s*<\/div>/)?.[1] ?? '');
  }

  const items: PropertyInput[] = [];
  for (const [auctionId, seller] of auctions) {
    const html = await get(`/leilao.php?idLeilao=${auctionId}&pagina=-1&action=0&todos=1`);
    const auctionTitle = decode(html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1] ?? '');
    for (const card of html.split('class="mb-4 lotePadrao ').slice(1)) {
      const id = card.match(/goTo\('lote\.php\?idLote=(\d+)/)?.[1]; // venda direta não casa aqui
      const listed = brl(card.match(/Inicial: R\$ <span>([\d.,]+)/)?.[1]) || brl(card.match(/Praça: R\$ <span>([\d.,]+)/)?.[1]);
      if (!id || !listed || /id="st\d+"[^>]*>\s*Retirado/.test(card)) continue;
      // Página do lote: localização e lance vigente; sequencial para não martelar o site.
      const page = await get(`/lote.php?idLote=${id}`);
      const loc = decode(page.match(/Ampliar o mapa para: <\/strong>\s*<a[^>]*>(.*?)<\/a>/s)?.[1] ?? '');
      // "Rua X, 111 - Bairro - Cidade/UF" (o bairro às vezes vem junto da rua, separado por vírgula)
      const parts = loc.split(' - ').map((s) => s.trim());
      const [city = '', uf = ''] = parts.pop()!.split(/\/(?=[A-Z]{2}$)/);
      const price = field(page, 'Lance Mínimo') || listed;
      if (!toUf(uf)) continue;
      const category = decode(card.match(/CATEGORIA:<\/span>(.*?)<\/div>/s)?.[1] ?? '');
      const desc = decode(page.match(/Descrição do lote<\/span>\s*<div[^>]*>\s*<div[^>]*>(.*?)<\/div>/s)?.[1] ?? '');
      const appraisal = field(page, 'Avaliação') || null;
      const discount = appraisal && appraisal > price ? (1 - price / appraisal) * 100 : 0;
      const kind = /^imove/.test(strip(category)) ? 'realstate' : /^veic/.test(strip(category)) ? 'vehicles' : 'equipments';
      const type = kind === 'realstate' ? title(desc.match(TYPE_RE)?.[1] ?? 'Imóvel') : kind === 'vehicles' ? 'Veículo' : title(category || 'Outros');
      items.push({
        externalId: id,
        kind,
        title: `${type} - ${city.trim()}/${toUf(uf)}`,
        images: [...new Set([...card.matchAll(/src="(sishp\/leilao\/[^"]+)"/g)].map((m) => `${SITE}/${m[1]}`))],
        state: toUf(uf),
        city: city.trim(),
        neighborhood: parts.length > 1 ? parts.at(-1)! : '',
        address: parts.length > 1 ? parts.slice(0, -1).join(' - ') : parts[0] ?? '',
        price,
        appraisalValue: appraisal,
        discount: Math.round(discount * 100) / 100,
        financing: false,
        propertyType: type,
        saleModality: [auctionTitle, seller && `(${seller})`].filter(Boolean).join(' '),
        description: desc,
        totalArea: area(desc, /[aá]rea (?:total |real )?(?:constru[ií]da|de (?:constru[çc][aã]o|edifica[çc][aã]o))(?: privativa)? de\s*([\d.,]+)\s*m/i),
        privateArea: area(desc, /privativa(?: coberta)? de\s*([\d.,]+)\s*m/i),
        landArea: area(desc, /terreno com [aá]rea (?:total )?de\s*([\d.,]+)\s*m/i),
        bedrooms: null,
        parkingSpaces: null,
        link: `${SITE}/lote.php?idLote=${id}`,
        ...(kind === 'realstate' ? {} : parseVehicle(desc.split(/[.;]/)[0], desc)),
      });
    }
  }
  return items;
}
