/**
 * Origem Emgea (Empresa Gestora de Ativos): página pública emgea.gov.br/imoveis.
 * GET /imoveis → HTML com TODOS os imóveis numa página só (~250); o filtro é feito no navegador.
 * Cada imóvel é um <tr class="imovel" data-...> com preço, avaliação, desconto e localidade
 * nos atributos data-*, mais título/endereço/áreas no texto. Sem paginação.
 * As fotos da listagem são ícones genéricos (casa.png, predio.png), por isso não são usadas.
 * A venda é negociada pela Caixa ("Negocie com a Caixa"): pode repetir imóveis do CSV da Caixa.
 */
import { parseBrl } from './parse.js';
import { toUf } from './bradesco.js';
import type { PropertyInput } from './sync.js';

const SITE = 'https://emgea.gov.br';

export async function fetchEmgea(): Promise<PropertyInput[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${SITE}/imoveis`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, (Number(res.headers.get('retry-after') ?? 60) + 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Emgea: HTTP ${res.status}`);
    const html = await res.text();
    return html
      .split('<tr class="imovel"')
      .slice(1)
      .map(toProperty)
      .filter((p): p is PropertyInput => !!p);
  }
}

const decode = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const orNull = (n: number | null) => n || null; // o site manda 0 para "não informado"

function toProperty(block: string): PropertyInput | null {
  const attr = (name: string) => decode(block.match(new RegExp(`data-${name}="([^"]*)"`, 'i'))?.[1] ?? '');
  const link = block.match(/href="\/imoveis\/Detalhe\/(\d+)">([^<]+)</);
  const local = attr('localidade'); // "RJSAO GONCALO"
  const state = toUf(local.slice(0, 2));
  const price = parseBrl(attr('precoVenda'));
  if (!link || !state || !price) return null;

  const appraisal = parseBrl(attr('precoMercado'));
  const discount = appraisal && appraisal > price ? (1 - price / appraisal) * 100 : 0;
  // "Endereço: RUA X, 53 CASA 02 - 24467-450 - BOACU": corta CEP e bairro
  const address = decode(block.match(/Endereço:([^<]*)</)?.[1] ?? '').split(/ - \d{5}-\d{3}/)[0];
  const type = attr('tipoImovel') || 'Outros';
  return {
    externalId: link[1],
    kind: 'realstate',
    title: decode(link[2]), // "Casa - SAO GONCALO/RJ"
    images: [],
    state,
    city: local.slice(2).trim(),
    neighborhood: attr('bairro'),
    address,
    price,
    appraisalValue: appraisal,
    discount: Math.round(discount * 100) / 100,
    financing: false,
    propertyType: type,
    saleModality: 'Venda Direta',
    description: `${type}, ${attr('Ocupacao')}`,
    totalArea: orNull(parseBrl(block.match(/Área Total:\s*([\d.,]+)/)?.[1])),
    privateArea: orNull(parseBrl(block.match(/Área privativa:\s*([\d.,]+)/)?.[1])),
    landArea: null,
    bedrooms: orNull(Number(attr('qtdQuartos'))),
    parkingSpaces: orNull(Number(attr('garagem'))),
    link: `${SITE}/imoveis/Detalhe/${link[1]}`,
  };
}
