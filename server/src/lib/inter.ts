/**
 * Origem Banco Inter: imoveis.bancointer.com.br redireciona para inter.superbid.net,
 * a loja do Inter&Co na Superbid (vendas conduzidas pela SOLD Leilões).
 * O site fica atrás do Cloudflare, mas a API pública que ele usa responde direto (curl passa):
 * GET offer-query.superbid.net/offers/?filter=stores.id:[16434]&pageNumber=N&pageSize=100
 *   → { total, offers }, pageNumber começa em 1.
 * Mesmo com searchType=opened vêm lotes já vendidos: filtramos por offerStatus.sold.
 * Só imóveis (productType 13); avaliação só quando a descrição traz "Valor Avaliado".
 */
import { parseBrl } from './parse.js';
import { toUf } from './bradesco.js';
import type { PropertyInput } from './sync.js';

const API =
  'https://offer-query.superbid.net/offers/?locale=pt_BR&portalId=[2,15]&requestOrigin=store' +
  '&timeZoneId=America%2FSao_Paulo&filter=stores.id:[16434]&searchType=opened&orderBy=endDate:asc&pageSize=100';
const SITE = 'https://inter.superbid.net/oferta/';

interface Offer {
  id: number;
  price: number | null;
  offerStatus: { sold: boolean; removed: boolean; closed: boolean };
  auction: { modalityDesc: string | null } | null; // "Tomada de preço", "Leilão"
  product: {
    shortDesc: string; // "Casa, Ocupado, 86.75 m2, FRANCO DA ROCHA / SP"
    detailedDescription: string | null; // HTML
    productType: { id: number } | null;
    subCategory: { description: string } | null; // "Casas", "Apartamentos", "Salas"...
    location: { city?: string; state?: string } | null; // city "Franco da Rocha - SP", state "São Paulo"
    galleryJson: { link: string; type: string }[] | null;
    template: { groups: { properties: { id: string; value: string }[] }[] } | null;
  };
}

async function getPage(page: number): Promise<{ total: number; offers: Offer[] }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}&pageNumber=${page}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, (Number(res.headers.get('retry-after') ?? 60) + 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Inter: HTTP ${res.status} na página ${page}`);
    return res.json();
  }
}

export async function fetchInter(): Promise<PropertyInput[]> {
  const offers: Offer[] = [];
  for (let page = 1, total = 1; offers.length < total; page++) {
    const res = await getPage(page);
    if (!res.offers?.length) break;
    offers.push(...res.offers);
    total = res.total;
  }
  return offers
    .filter((o) => o.product.productType?.id === 13 && !o.offerStatus.sold && !o.offerStatus.removed)
    .map(toProperty)
    .filter((p) => p.state && p.price);
}

const stripHtml = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').trim();

function toProperty(o: Offer): PropertyInput {
  const p = o.product;
  const field = (id: string) =>
    p.template?.groups.flatMap((g) => g.properties).find((f) => f.id === id)?.value?.trim() || '';
  const area = (id: string) => Number(field(id)) || null; // "86.75"
  const [city = '', cityUf = ''] = (p.location?.city ?? '').split(' - ');
  const desc = stripHtml(p.detailedDescription ?? '');
  const price = o.price ?? 0;
  const appraisal = parseBrl(desc.match(/Valor Avaliado:\s*R\$\s*([\d.,]+)/i)?.[1]);
  const discount = appraisal && appraisal > price ? (1 - price / appraisal) * 100 : 0;
  return {
    externalId: String(o.id),
    kind: 'realstate',
    title: p.shortDesc.trim(),
    images: (p.galleryJson ?? []).filter((g) => g.type === 'photo').map((g) => g.link),
    state: toUf(p.location?.state ?? null) || toUf(cityUf),
    city: city.trim(),
    neighborhood: '',
    address: field('endereco'),
    price,
    appraisalValue: appraisal,
    discount: Math.round(discount * 100) / 100,
    financing: /financiad|financiamento/i.test(p.shortDesc + desc),
    propertyType: p.subCategory?.description || 'Outros',
    saleModality: o.auction?.modalityDesc ?? '',
    description: desc,
    totalArea: area('areatotal'),
    privateArea: null,
    landArea: area('areadoterreno'),
    bedrooms: null,
    parkingSpaces: Number(field('quantidadedevagas')) || null,
    link: SITE + o.id,
  };
}
