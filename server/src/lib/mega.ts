/**
 * Origem Mega Leilões: megaleiloes.com.br (Yii2, HTML renderizado no servidor, sem API JSON).
 * GET /<categoria>?per-page=50&pagina=N → cards com preço, praças, cidade/UF e link.
 * per-page acima de 50 é ignorado; o nº de páginas vem em "Página <b>1</b> de <b>15</b>".
 * Categorias: imoveis, veiculos e industrial (máquinas → equipments). "outros" (direitos
 * minerários, peças...) e "bens-de-consumo" não têm chave em KINDS e ficam de fora.
 * Só lotes abertos/em breve aparecem na listagem (os encerrados ficam em /leiloes-realizados).
 * A maioria é judicial; robots.txt só bloqueia /login. O 429, se vier, é tratado como no Bradesco.
 */
import { parseBrl } from './parse.js';
import { parseVehicle, toUf } from './bradesco.js';
import type { PropertyInput } from './sync.js';

const SITE = 'https://www.megaleiloes.com.br';
const PER_PAGE = 50;
const CATEGORIES: Record<string, string> = { imoveis: 'realstate', veiculos: 'vehicles', industrial: 'equipments' };

// Subcategoria da URL do lote → tipo; o que não estiver aqui vira o slug capitalizado.
const TYPES: Record<string, string> = {
  apartamentos: 'Apartamento', casas: 'Casa', 'terrenos-e-lotes': 'Terreno', 'imoveis-comerciais': 'Comercial',
  'imoveis-rurais': 'Rural', 'galpoes--industriais': 'Galpão', carros: 'Carro', motos: 'Moto',
  caminhoes: 'Caminhão', maquinas: 'Máquina', 'vagas-de-garagem': 'Vaga de Garagem', galpoes: 'Galpão',
  glebas: 'Gleba', 'terrenos-para-incorporacao': 'Terreno',
};

async function get(url: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? 60);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Mega: HTTP ${res.status} em ${url}`);
    return res.text();
  }
}

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const brl = (s: string | undefined) => parseBrl(s?.replace(/[^\d.,]/g, ''));

export async function fetchMega(): Promise<PropertyInput[]> {
  const items: PropertyInput[] = [];
  for (const [category, kind] of Object.entries(CATEGORIES)) {
    for (let page = 1, total = 1; page <= total; page++) {
      const html = await get(`${SITE}/${category}?per-page=${PER_PAGE}&pagina=${page}`);
      total = Number(html.match(/Página <b>\d+<\/b> de <b>(\d+)<\/b>/)?.[1] ?? 1);
      for (const card of html.split(/<div class="card (?:open|waiting)[^"]*">/).slice(1)) {
        const item = toProperty(card, kind);
        if (item) items.push(item);
      }
    }
  }
  return items;
}

function toProperty(card: string, kind: string): PropertyInput | null {
  const link = card.match(/class="card-title" href="([^"?]+)/)?.[1];
  const title = decode(card.match(/class="card-title"[^>]*>(.*?)<\/a>/s)?.[1] ?? '');
  const [city, uf] = decode(card.match(/class="card-locality"[^>]*>(.*?)<\/a>/s)?.[1] ?? '').split(/,\s*(?=[A-Z]{2}$)/);
  const price = brl(card.match(/class="card-price">(.*?)<\/div>/s)?.[1]);
  const code = card.match(/class="card-number[^"]*">\s*(\w+)/)?.[1]; // "J128387"
  if (!link || !code || !toUf(uf ?? null) || !price) return null;

  // Duas praças: a 1ª é pelo valor de avaliação (o edital do judicial diz isso), como no Bradesco.
  const instances = [...card.matchAll(/class="card-instance-value">(.*?)<\/span>/gs)].map((m) => brl(m[1]));
  const reference = instances.length > 1 ? instances[0] : null;
  const discount = reference && reference > price ? (1 - price / reference) * 100 : 0;
  const slug = link.replace(SITE + '/', '').split('/')[1] ?? '';
  const type = TYPES[slug] ?? (slug ? slug[0].toUpperCase() + slug.slice(1).replace(/-+/g, ' ') : 'Outros');
  // Imóvel: "Apartamento 75 m² ... - Moema - São Paulo - SP" → bairro é o antepenúltimo trecho.
  const parts = title.split(' - ');
  const area = kind === 'realstate' ? parseBrl(title.match(/([\d.,]+)\s*m²/)?.[1]) : null;
  const land = /terreno|rura|gleba/.test(slug);
  const modality = decode(card.match(/class="card-instance-title">(.*?)<div/s)?.[1] ?? ''); // Judicial | Extrajudicial
  return {
    externalId: code,
    kind,
    title,
    images: [card.match(/data-bg="([^"]+)"/)?.[1]].filter((u) => u && !u.includes('no-image')),
    state: toUf(uf),
    city: city.trim(),
    neighborhood: kind === 'realstate' && parts.length >= 4 ? parts.at(-3)!.trim() : '',
    address: '',
    price,
    appraisalValue: reference,
    discount: Math.round(discount * 100) / 100,
    financing: false,
    propertyType: type,
    saleModality: modality ? `Leilão ${modality}` : 'Leilão',
    description: '',
    // Área do título ("75 m²"): de terreno em lotes, glebas e rurais; construída nos demais.
    totalArea: land ? null : area,
    privateArea: null,
    landArea: land ? area : null,
    bedrooms: null,
    parkingSpaces: null,
    link,
    ...(kind === 'vehicles' ? vehicle(title) : {}),
  };
}

/**
 * "Carro Peugeot Passion 207 XS - 2010" ou "Moto Honda, CG 150 TITAN ES - 2007/2008"
 * → "Peugeot - Passion 207 XS - 2010 / 2010" para o parseVehicle.
 * ponytail: marca é a 2ª palavra; com um ano só, ele vale para fabricação e modelo.
 */
function vehicle(title: string) {
  const m = title.match(/^\S+\s+([^\s,]+),?\s+(.+?)\s+-\s+(\d{4})(?:\s*\/\s*(\d{4}))?/);
  return parseVehicle(m ? `${m[1]} - ${m[2]} - ${m[3]} / ${m[4] ?? m[3]}` : title, title);
}
