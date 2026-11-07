/**
 * Origem Receita Federal: Sistema de Leilão Eletrônico (SLE), API JSON pública do SPA
 * www25.receita.fazenda.gov.br/sle-sociedade (a listagem é aberta; lance exige gov.br).
 *   1. GET api/portal → filtros (U = UFs com editais ativos: próximos e abertos para proposta).
 *   2. GET api/portal?U=<UF> → editais da UF (edle "600100/6/2026", cidade da unidade).
 *   3. GET api/edital/<edle> → listaLotes: tipo, valorMinimo, imagens. Sem paginação.
 *   4. GET api/lote/<edle>/<lote> → itensDetalhesLote (descrição); só para veículos/aeronaves/barcos.
 * Os lotes não têm UF própria: vale a UF do edital. Muitos lotes agrupam vários itens.
 */
import { parseVehicle, toUf } from './bradesco.js';
import type { PropertyInput } from './sync.js';

const API = 'https://www25.receita.fazenda.gov.br/sle-sociedade/api/';
const SITE = 'https://www25.receita.fazenda.gov.br/sle-sociedade/portal/edital/';

// Tipo de lote do SLE → KINDS; o resto (eletrônicos, relógios, bazar...) vira "goods".
const KIND_BY_TIPO: Record<string, string> = {
  'VEÍCULO': 'vehicles',
  'AUTOMÓVEL/UTILITÁRIO': 'vehicles',
  'CAMINHÃO/ÔNIBUS': 'vehicles',
  'MOTOCICLETA/ACESSÓRIO': 'vehicles',
  'VEÍCULO PARA DESMONTAGEM': 'vehicles',
  AERONAVE: 'aircraft',
  'EMBARCAÇÃO': 'boat',
  'APARELHO/PEÇA MECÂNICA': 'equipments',
};
// Disponibilizado, aberto/fechado para proposta, aberto para lance.
const ATIVOS = new Set([11, 12, 13, 15]);
// ponytail: ~0,25 s por lote; o limite segura a sync em ~2,5 min (~700 lotes de veículo hoje). Acima dele o lote fica sem descrição.
const DETAIL_LIMIT = 400;

interface Lote {
  nrAtribuido: number;
  tipo: string; // "VEÍCULO", "INFORMÁTICA"...
  situacaoLote: number;
  valorMinimo: number | null;
  imagens: { src: string }[] | null;
}
interface Item {
  quantidade: number;
  unMedida: string;
  descricao: string; // "CAMINHONETE CHEVROLET S10 LT DD2A 2014 PUQ-6F58 PRATA CHASSI ... BRASIL////"
}

async function get<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 30_000));
      continue;
    }
    if (!res.ok) throw new Error(`Receita: HTTP ${res.status} em ${path}`);
    return res.json();
  }
}

export async function fetchReceita(): Promise<PropertyInput[]> {
  const portal = await get<{ filtros: { id: string; opcoes: { id: string }[] }[] }>('portal');
  const ufs = portal.filtros.find((f) => f.id === 'U')?.opcoes.map((o) => o.id) ?? [];

  const items: PropertyInput[] = [];
  let details = 0;
  for (const uf of ufs) {
    const { editais } = await get<{ editais: { edle: string; cidade: string }[] }>(`portal?U=${uf}`);
    for (const ed of editais) {
      const { listaLotes } = await get<{ listaLotes: Lote[] }>(`edital/${ed.edle}`);
      for (const l of listaLotes) {
        if (!ATIVOS.has(l.situacaoLote) || !l.valorMinimo || !toUf(uf)) continue;
        const kind = KIND_BY_TIPO[l.tipo] ?? 'goods';
        const itens =
          kind !== 'goods' && details++ < DETAIL_LIMIT
            ? (await get<{ itensDetalhesLote: Item[] | null }>(`lote/${ed.edle}/${l.nrAtribuido}`)).itensDetalhesLote ?? []
            : [];
        items.push(toProperty(ed.edle, ed.cidade, uf, l, kind, itens));
      }
    }
  }
  return items;
}

// "////" separa a descrição do bem das observações do edital.
const clean = (s: string) => s.replace(/\/{4}\s*$/, '').replace(/\/{4}/g, '. ').trim();

function toProperty(edle: string, cidade: string, uf: string, l: Lote, kind: string, itens: Item[]): PropertyInput {
  const desc = itens.map((i) => `${i.quantidade} ${i.unMedida} ${clean(i.descricao)}`).join('\n');
  // Lote de um item só: a descrição é o melhor título.
  const title = itens.length === 1 ? itens[0].descricao.split('////')[0].trim() : `${l.tipo} - Lote ${l.nrAtribuido}`;
  // Nome vazio: o título do SLE não segue "MARCA - MODELO - ANO", só a descrição serve.
  const vehicle = kind === 'goods' || kind === 'equipments' ? {} : parseVehicle('', desc);
  // Ano solto no título quando o lote tem um único bem.
  if ('year' in vehicle && !vehicle.year && itens.length === 1) {
    const y = Number(title.match(/\b(19[5-9]\d|20[0-4]\d)\b/)?.[1]) || null;
    Object.assign(vehicle, { year: y, manufactureYear: y });
  }
  return {
    externalId: `${edle}/${l.nrAtribuido}`,
    kind,
    title,
    images: (l.imagens ?? []).map((i) => i.src),
    state: toUf(uf),
    city: cidade.trim(),
    neighborhood: '',
    address: '',
    price: l.valorMinimo,
    // A API traz valorAvaliacao, mas o site não o exibe: sem desconto.
    appraisalValue: null,
    discount: 0,
    financing: false,
    propertyType: l.tipo,
    saleModality: `Leilão Receita Federal - Edital ${edle}`,
    description: desc,
    totalArea: null,
    privateArea: null,
    landArea: null,
    bedrooms: null,
    parkingSpaces: null,
    link: `${SITE}${edle}/lote/${l.nrAtribuido}`,
    ...vehicle,
  };
}
