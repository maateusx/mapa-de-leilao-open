/**
 * Origem Santander: API JSON por trás de santanderimoveis.com.br (SPA Angular).
 * GET /real_estate_properties?_offset=P&_limit=500 → { content, pagination: { totalElements } }.
 * Atenção: _offset é o índice da página (0, 1, 2...), não o deslocamento em itens.
 * Exige o header "x-api-key", a mesma chave pública embutida no bundle do site.
 * Atrás do Akamai: o fetch do Node passa, mas o curl leva 403 (fingerprint TLS).
 * Só imóveis; sem headers de rate limit, mas o 429 é tratado como no Bradesco.
 */
import type { PropertyInput } from './sync.js';
import { toUf } from './bradesco.js';

const API = 'https://api.shi.santander.com.br/v1/real_estate_auctions/real_estate_properties';
const SITE = 'https://www.santanderimoveis.com.br/details/';
const HEADERS = { 'User-Agent': 'Mozilla/5.0', 'x-api-key': 'd9ffca1a-71af-48e4-bece-8bc852455cd7' };
const LIMIT = 500;

type Money = { amount: number | null } | null;
interface Item {
  realEstatePropertyId: number;
  description: string | null;
  buildingType: { buildingTypeDescription: string } | null; // "Casa", "Apartamento", "Lote Urbano"...
  financialInformation: { marketValue: Money } | null; // valor de mercado (avaliação)
  images: { imageUrl: string; isCoverImage: boolean; displayOrder: number; isPublished: boolean }[] | null;
  physicalCharacteristics: {
    areaCharacteristics: { builtArea: number; totalArea: number; privateArea: number; landArea: number } | null;
    quantityCharacteristics: { bedroomCount: number | null; parkingSpaceCount: number | null } | null;
  } | null;
  postalAddress: {
    streetName: string | null;
    streetBuildingIdentification: string | null; // número; "0" quando não há
    mailDeliverySubLocation: string | null; // complemento
    districtName: string | null;
    state: { stateCode: string } | null;
    city: { cityName: string } | null;
  } | null;
  saleInformation: {
    saleType: { saleTypeDescription: string } | null; // "Leilão Público", "Venda Direta", "Imobiliaria"
    isSold: boolean | null;
    minimumSalePrice: Money;
    initialSalePrice: Money; // vem 0 em boa parte; o site cai para o mínimo
  } | null;
}

async function getPage(page: number): Promise<{ content: Item[]; pagination: { totalElements: number } }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}?_offset=${page}&_limit=${LIMIT}`, { headers: HEADERS });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? 60);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Santander: HTTP ${res.status} na página ${page}`);
    return res.json();
  }
}

export async function fetchSantander(): Promise<PropertyInput[]> {
  const items: Item[] = [];
  for (let page = 0, total = 1; page * LIMIT < total; page++) {
    const res = await getPage(page);
    items.push(...res.content);
    total = res.pagination.totalElements;
  }
  return items
    .filter((i) => toUf(i.postalAddress?.state?.stateCode ?? null) && price(i) && !i.saleInformation?.isSold)
    .map(toProperty);
}

// Mesma regra do site: valor inicial, senão o mínimo de venda.
const price = (i: Item) => i.saleInformation?.initialSalePrice?.amount || i.saleInformation?.minimumSalePrice?.amount || 0;
const orNull = (n: number | null | undefined) => n || null; // a API manda 0 para "não informado"

function toProperty(i: Item): PropertyInput {
  const addr = i.postalAddress!;
  const areas = i.physicalCharacteristics?.areaCharacteristics;
  const qty = i.physicalCharacteristics?.quantityCharacteristics;
  const type = i.buildingType?.buildingTypeDescription || 'Outros';
  const state = toUf(addr.state?.stateCode ?? null);
  const city = addr.city?.cityName?.trim() ?? '';
  const value = price(i);
  const appraisal = orNull(i.financialInformation?.marketValue?.amount);
  const discount = appraisal && appraisal > value ? (1 - value / appraisal) * 100 : 0;
  const number = addr.streetBuildingIdentification?.trim();
  return {
    externalId: String(i.realEstatePropertyId),
    kind: 'realstate',
    title: `${type} - ${city}/${state}`,
    images: (i.images ?? [])
      .filter((img) => img.isPublished)
      .sort((a, b) => Number(b.isCoverImage) - Number(a.isCoverImage) || a.displayOrder - b.displayOrder)
      .map((img) => encodeURI(img.imageUrl)), // nomes de arquivo com espaço
    state,
    city,
    neighborhood: addr.districtName?.trim() ?? '',
    address: [addr.streetName, number !== '0' && number, addr.mailDeliverySubLocation]
      .filter(Boolean)
      .join(', ')
      .trim(),
    price: value,
    appraisalValue: appraisal,
    discount: Math.round(discount * 100) / 100,
    financing: false,
    propertyType: type,
    saleModality: i.saleInformation?.saleType?.saleTypeDescription ?? '',
    description: i.description?.trim() ?? '',
    totalArea: orNull(areas?.builtArea || areas?.totalArea),
    privateArea: orNull(areas?.privateArea),
    landArea: orNull(areas?.landArea),
    bedrooms: orNull(qty?.bedroomCount),
    parkingSpaces: orNull(qty?.parkingSpaceCount),
    link: SITE + i.realEstatePropertyId,
  };
}
