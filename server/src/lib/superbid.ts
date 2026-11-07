/**
 * Origem Superbid Exchange (superbid.net) e Sold (sold.com.br): mesmo backend.
 * Os dois sites consultam a mesma API pública com portalId=[2,15] (2 = Superbid, 15 = Sold),
 * então um módulo cobre ambos.
 * GET https://offer-query.superbid.net/offers/?portalId=[2,15]&searchType=opened
 *       &filter=product.productType.description:<categoria>&orderBy=id:asc&pageSize=1000&pageNumber=N
 *   → { total, offers }, pageNumber começa em 1.
 * O catálogo aberto tem ~12,5 mil ofertas; aqui só as categorias que viram KINDS (~8 mil).
 * O OpenSearch não pagina além de 10 mil itens, por isso a busca é por categoria.
 * Sem orderBy a ordem muda entre páginas (repete/pula): orderBy=id:asc é obrigatório.
 * O site (www.superbid.net) fica atrás do Cloudflare; a API não.
 * Mesmo com searchType=opened vêm alguns vendidos/removidos: filtrados por offerStatus.
 * A loja do Inter&Co (stores.id 16434) fica de fora: já é a origem `inter` (inter.ts).
 * Sem limite documentado; 429 tratado como no Bradesco.
 */
import { parseBrl } from './parse.js';
import { parseVehicle, toUf } from './bradesco.js';
import type { PropertyInput } from './sync.js';

const API = 'https://offer-query.superbid.net/offers/';
const SITE = 'https://www.superbid.net/oferta/';
const PER_PAGE = 1000;
const INTER_STORE = 16434;

/** Slug da categoria na API → kind (embarcações/aeronaves se separam pela subcategoria). */
const CATEGORIES: Record<string, string> = {
  imoveis: 'realstate',
  'carros-motos': 'vehicles',
  'caminhoes-onibus': 'vehicles',
  'embarcacoes-aeronaves': 'boat',
  'industrial-maquinas-equipamentos': 'equipments',
  'maquinas-pesadas-agricolas': 'equipments',
  'movimentacao-transporte': 'equipments', // empilhadeiras, carretas, guindastes
};

type Named = { description?: string } | null;
interface Offer {
  id: number;
  price: number | null;
  offerStatus: { sold: boolean; removed: boolean };
  stores: { id: number }[] | null;
  offerDetail: { initialBidValue?: number; currentMinBid?: number } | null;
  auction: {
    modalityDesc: string; // "Leilão", "Tomada de preço"
    subMarketplaces: { subMarketplaceDesc: string }[] | null; // "Judicial", "Corporativo"...
    eventPipeline: { currentStage: number; stages: { initialBidValue: number | null }[] } | null;
  };
  product: {
    shortDesc: string;
    detailedDescription: string | null; // HTML
    thumbnailUrl?: string;
    galleryJson?: { link: string; type: string }[];
    subCategory: Named; // "Apartamentos", "Motocicletas", "Barcos de Alumínio"...
    brand: Named;
    model: Named;
    // city vem "Sete Lagoas - MG" ou só "São Caetano do Sul"; state é o nome por extenso.
    location: { city?: string; state?: string; neighborhood?: string; street?: string } | null;
  };
}

async function getPage(category: string, page: number): Promise<{ total: number; offers: Offer[] }> {
  const query = `portalId=[2,15]&locale=pt_BR&timeZoneId=America/Sao_Paulo&searchType=opened&orderBy=id:asc`
    + `&filter=product.productType.description:${category}&pageSize=${PER_PAGE}&pageNumber=${page}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}?${query}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? 60);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Superbid: HTTP ${res.status} em ${category}, página ${page}`);
    return res.json();
  }
}

const decode = (s: string) =>
  s.replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** "Sete Lagoas - MG" → ["Sete Lagoas", "MG"] */
const splitCity = (city = '') => city.match(/^(.+?)\s*[-/]\s*([A-Z]{2})$/)?.slice(1) ?? [city.trim(), ''];
const price = (o: Offer) => o.price || o.offerDetail?.currentMinBid || o.offerDetail?.initialBidValue || 0;

export async function fetchSuperbid(): Promise<PropertyInput[]> {
  const offers: (Offer & { kind: string })[] = [];
  for (const [category, kind] of Object.entries(CATEGORIES)) {
    for (let page = 1, total = 1; (page - 1) * PER_PAGE < total; page++) {
      const res = await getPage(category, page);
      offers.push(...res.offers.map((o) => ({ ...o, kind })));
      total = res.total;
    }
  }

  // Parte das ofertas só traz o nome da cidade, sem UF: usa a UF que a mesma cidade
  // tem nas outras ofertas, quando é uma só.
  // ponytail: homônimas fora do catálogo podem pegar a UF errada; geocodificar locationGeo se incomodar.
  const ufsByCity = new Map<string, Set<string>>();
  for (const o of offers) {
    const [city, uf] = splitCity(o.product.location?.city);
    if (uf) ufsByCity.set(city.toLowerCase(), (ufsByCity.get(city.toLowerCase()) ?? new Set()).add(uf));
  }
  const ufOf = (o: Offer, city: string, uf: string) => {
    const known = ufsByCity.get(city.toLowerCase());
    return toUf(uf) || toUf(o.product.location?.state ?? null) || (known?.size === 1 ? [...known][0] : '');
  };

  const items: PropertyInput[] = [];
  const seen = new Set<number>();
  for (const o of offers) {
    const sub = o.product.subCategory?.description ?? '';
    if (o.offerStatus.sold || o.offerStatus.removed || o.stores?.some((s) => s.id === INTER_STORE)) continue;
    if (o.kind === 'boat' && /pe[çc]as/i.test(sub)) continue; // peças e acessórios não são embarcações
    const [city, uf] = splitCity(o.product.location?.city);
    const state = ufOf(o, city, uf);
    const value = price(o);
    if (!state || !value || seen.has(o.id)) continue;
    seen.add(o.id);
    const kind = o.kind === 'boat' && /avi[aã]o|avi[oõ]es|helic|aeronave/i.test(sub) ? 'aircraft' : o.kind;
    const title = o.product.shortDesc.trim();
    const desc = decode(o.product.detailedDescription ?? '');
    // Avaliação: a que a descrição declara ("AVALIAÇÃO (conforme valor venal): R$19.539,00",
    // "Valor Avaliado: R$ ..."); senão, da 2ª praça em diante, o lance da 1ª (regra do Bradesco).
    const pipeline = o.auction.eventPipeline;
    const declared = parseBrl(desc.match(/(?:valor avaliado|avalia[çc][ãa]o)[^R]{0,80}R\$\s*([\d.,]+\d)/i)?.[1]);
    const first = pipeline && pipeline.currentStage > 1 ? pipeline.stages[0]?.initialBidValue ?? null : null;
    const appraisal = declared || first;
    const reference = appraisal && appraisal > value ? appraisal : null;
    const market = o.auction.subMarketplaces?.[0]?.subMarketplaceDesc;
    const photos = (o.product.galleryJson ?? []).filter((g) => g.type === 'photo').map((g) => g.link);
    items.push({
      externalId: String(o.id),
      kind,
      title,
      images: photos.length ? photos : [o.product.thumbnailUrl].filter(Boolean),
      state,
      city,
      neighborhood: o.product.location?.neighborhood?.trim() ?? '',
      address: o.product.location?.street?.trim() ?? '',
      price: value,
      appraisalValue: reference,
      discount: reference ? Math.round((1 - value / reference) * 10000) / 100 : 0,
      financing: false,
      propertyType: sub || 'Outros',
      saleModality: [o.auction.modalityDesc, market].filter(Boolean).join(' - '),
      description: desc,
      totalArea: null,
      privateArea: null,
      landArea: null,
      bedrooms: null,
      parkingSpaces: null,
      link: `${SITE}${slug(title)}-${o.id}`, // o site só usa o id do fim; o slug é cosmético
      ...(kind === 'realstate' ? {} : {
        ...parseVehicle(title, desc.replace(/\bkm:\s*/gi, 'km ')), // "KM: 123.456"
        // Títulos livres ("SCANIA R-540"); quando o lote tem marca/modelo cadastrados, valem eles.
        ...(o.product.brand?.description && { brand: o.product.brand.description }),
        ...(o.product.model?.description && { model: o.product.model.description }),
      }),
    });
  }
  return items;
}
