/**
 * Origem Bradesco: API JSON pública por trás de vitrinebradesco.com.br.
 * GET /v1/auctions?type=<tipo>&page=N → { data, total_pages }, 30 por página.
 * Os tipos da API (TYPES) coincidem com as chaves de KINDS em config.ts.
 * Limite de 50 requisições por janela; o 429 traz "retry-after" em segundos.
 */
import { parseBrl } from './parse.js';
import type { PropertyInput } from './sync.js';

const API = 'https://api.vitrinebradesco.com.br/v1/auctions';
const TYPES = ['realstate', 'vehicles', 'equipments', 'aircraft', 'boat'];
const SITE = 'https://vitrinebradesco.com.br/auctions/';

interface Auction {
  guid: string;
  name: string; // "Casa - Gurupi/TO - Rua G, 250, Waldir Lins I" | "TOYOTA - HILUX CD - 2017 / 2018"
  type: string; // realstate, vehicles, equipments, aircraft, boat
  images: string[] | null;
  slug: string;
  price: number | null; // lance mínimo vigente (1ª ou 2ª praça); vem 0 em parte dos itens
  final_auction_value: number | null; // às vezes é o único valor preenchido
  min_auction_value_1: number | null;
  min_auction_value_2: number | null;
  city: string;
  state: string; // "TO" nos imóveis, "Ceará" nos veículos
  neighborhood: string | null;
  description: string | null;
  category: string | null;
  realstate_auction_type: string | null; // "alienacao-fiduciaria"
}

async function getPage(type: string, page: number): Promise<{ data: Auction[]; total_pages: number }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}?type=${type}&page=${page}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? 60);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Bradesco: HTTP ${res.status} em ${type}, página ${page}`);
    return res.json();
  }
}

export async function fetchBradesco(): Promise<PropertyInput[]> {
  const auctions: Auction[] = [];
  for (const type of TYPES) {
    for (let page = 1, total = 1; page <= total; page++) {
      const res = await getPage(type, page);
      auctions.push(...res.data.map((a) => ({ ...a, type: a.type || type })));
      total = res.total_pages;
    }
  }
  return auctions.filter((a) => a.guid && toUf(a.state) && currentPrice(a)).map(toProperty);
}

/** "Área Construída: 120,73m²", "constr. 93,28m²", "Área privativa 268,91m²"... */
const area = (desc: string, re: RegExp) => parseBrl(desc.match(re)?.[1]);

const currentPrice = (a: Auction) =>
  a.price || a.final_auction_value || a.min_auction_value_2 || a.min_auction_value_1;

const MODALITY: Record<string, string> = {
  'alienacao-fiduciaria': 'Leilão - Alienação Fiduciária',
  convencional: 'Leilão',
};

const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const UF_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries({
    AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
    DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
    MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
    PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
    RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
    SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
  }).flatMap(([uf, name]) => [[strip(name), uf], [uf.toLowerCase(), uf]])
);
const FUELS: [RegExp, string][] = [
  [/h[ií]brido/i, 'Híbrido'],
  [/el[eé]trico/i, 'Elétrico'],
  [/flex|alcool\/gasolina|gas\/alc/i, 'Flex'],
  [/diesel/i, 'Diesel'],
  [/gasolina/i, 'Gasolina'],
  [/[aá]lcool|etanol/i, 'Álcool'],
  [/\bgnv\b/i, 'GNV'],
];
const COLOR_RE =
  /\b(branc[ao]|pret[ao]|prata|cinza|azul|vermelh[ao]|verde|amarel[ao]|bege|dourad[ao]|laranja|marrom|rosa|vinho|grafite)\b/i;
const BRAND_ALIAS: Record<string, string> = { Gm: 'Chevrolet', Vw: 'Volkswagen', 'Mercedes Benz': 'Mercedes-Benz' };
const toBrand = (s: string) => (/\p{L}/u.test(s) ? BRAND_ALIAS[title(s)] ?? title(s) : null);
const title = (s: string) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());

/**
 * Campos de veículo/equipamento. O nome é sempre "MARCA - MODELO - 2017 / 2018";
 * a descrição varia por leiloeiro:
 *   Copart:  "TOYOTA HILUX CD, 2017/2018, Preta, Diesel, Km 156057, Média Monta"
 *   Freitas: "Volvo, Xc60 T8 Momentum, 2021, 2021, Preta, Flex, 103066"
 *   VIP:     "CHEVROLET SPIN - 2025/2026 - Branca - Exposto em: ..."
 * ponytail: heurística por regex; leiloeiro com formato novo pode deixar campos nulos.
 */
export function parseVehicle(name: string, fullDesc: string) {
  // Na VIP o resto é o endereço de exposição ("RODOVIA BR 470 KM 17"): não é km nem cor.
  const desc = fullDesc.split(/exposto em/i)[0];
  const parts = name.split(' - ').map((s) => s.trim());
  const years = name.match(/(\d{4})\s*\/\s*(\d{4})\s*$/) ?? desc.match(/ano\D{0,15}(\d{4})()/i);
  const km = desc.match(/\bkm\s*([\d.]+)/i)?.[1] ?? desc.match(/,\s*(\d{3,7})\s*$/)?.[1];
  const color = desc.match(COLOR_RE)?.[1];
  const damage = desc.match(/\b(pequena|m[eé]dia|grande)\s+monta\b/i)?.[1];
  return {
    brand: parts.length >= 3 ? toBrand(parts[0]) : null,
    model: parts.length >= 3 ? parts.slice(1, -1).join(' - ') : null,
    manufactureYear: years ? Number(years[1]) : null,
    year: years ? Number(years[2] || years[1]) : null,
    km: km ? Number(km.replace(/\./g, '')) || null : null, // "Km 0" na Copart = não informado
    fuel: FUELS.find(([re]) => re.test(desc))?.[1] ?? null,
    color: color ? title(color.replace(/o$/i, 'a')) : null,
    damage: damage ? `${title(damage).replace('Media', 'Média')} Monta` : null,
  };
}

/** "TO" ou "Ceará" → UF; '' se não reconhecer. */
export const toUf = (state: string | null) => UF_BY_NAME[strip(state ?? '')] ?? '';

export function toProperty(a: Auction): PropertyInput {
  const desc = a.description ?? '';
  const price = currentPrice(a) ?? 0;
  // Lance da 1ª praça como referência de "avaliação": na alienação fiduciária
  // ele não pode ser menor que o valor de avaliação do imóvel.
  const reference = a.min_auction_value_1 ?? null;
  const discount = reference && reference > price ? (1 - price / reference) * 100 : 0;
  return {
    externalId: a.guid,
    kind: a.type,
    title: a.name.trim(),
    images: a.images ?? [],
    state: toUf(a.state),
    city: a.city?.trim() ?? '',
    neighborhood: a.neighborhood?.trim() ?? '',
    // Só imóveis têm endereço, embutido no nome: "Categoria - Cidade/UF - endereço".
    address: a.type === 'realstate' ? a.name.split(' - ').slice(2).join(' - ').trim() : '',
    price,
    appraisalValue: reference,
    discount: Math.round(discount * 100) / 100,
    financing: false,
    propertyType: a.category || 'Outros',
    saleModality: MODALITY[a.realstate_auction_type ?? ''] ?? a.realstate_auction_type ?? '',
    description: desc,
    totalArea: area(desc, /constr(?:\.|uída:?)\s*([\d.,]+)\s*m²/i),
    privateArea: area(desc, /privativa:?\s*([\d.,]+)\s*m²/i),
    landArea: area(desc, /terr(?:\.|eno:?)\s*([\d.,]+)\s*m²/i),
    bedrooms: null,
    parkingSpaces: null,
    link: SITE + a.slug,
    ...(a.type === 'realstate' ? {} : parseVehicle(a.name, desc)),
  };
}
