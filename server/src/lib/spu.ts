/**
 * Origem SPU (Imóveis da União): API JSON pública do SPA imoveis.economia.gov.br.
 * GET /api/public/imoveis?sala=<sala>&page=N&size=100 → { content, totalPages } (Spring Page, page começa em 0).
 * As "salas" à venda são venda (venda direta), concorrencia, leilao, autorizados, pai e fundo;
 * sala vazia responde 204 sem corpo. "emProcesso" e "vendido" ficam de fora (sem preço / já vendidos).
 * Só imóveis; a vitrine costuma ter poucos itens ativos ao mesmo tempo.
 */
import type { PropertyInput } from './sync.js';
import { toUf } from './bradesco.js';

const API = 'https://imoveis.economia.gov.br/api';
const SITE = 'https://imoveis.economia.gov.br/imovel/';
const SALAS: Record<string, string> = {
  venda: 'Venda Direta',
  concorrencia: 'Concorrência',
  leilao: 'Leilão',
  autorizados: 'Autorizados',
  pai: 'Proposta de Aquisição (PAI)',
  fundo: 'Fundo Imobiliário',
};

interface Imovel {
  id: number;
  idItemEdital: number | null;
  valor: number | null; // valor mínimo do item no edital
  sala: { subtipo: string };
  endereco: { estado: string; cidade: string; bairro: string | null; completo: string } | null;
  tipoImovel: { nome: string } | null;
  fotos?: { src: string }[];
  entidadeProprietaria: { nome: string } | null; // SPU, INSS...
  dataSessao: string | null;
}

async function getPage(sala: string, page: number): Promise<{ content: Imovel[]; totalPages: number }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/public/imoveis?sala=${sala}&page=${page}&size=100`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 30_000));
      continue;
    }
    if (res.status === 204) return { content: [], totalPages: 0 }; // sala sem imóveis
    if (!res.ok) throw new Error(`SPU: HTTP ${res.status} na sala ${sala}, página ${page}`);
    return res.json();
  }
}

export async function fetchSpu(): Promise<PropertyInput[]> {
  const imoveis: Imovel[] = [];
  for (const sala of Object.keys(SALAS)) {
    for (let page = 0, total = 1; page < total; page++) {
      const res = await getPage(sala, page);
      imoveis.push(...res.content);
      total = res.totalPages;
    }
  }
  return imoveis.filter((i) => i.valor && toUf(i.endereco?.estado ?? '')).map(toProperty);
}

function toProperty(i: Imovel): PropertyInput {
  const tipo = i.tipoImovel?.nome || 'Outros';
  const end = i.endereco!;
  return {
    // O mesmo imóvel pode voltar em outro edital; o id do imóvel é estável.
    externalId: String(i.id),
    kind: 'realstate',
    title: `${tipo} - ${end.cidade}/${end.estado}`,
    images: (i.fotos ?? []).map((f) => API + encodeURI(f.src)),
    state: toUf(end.estado),
    city: end.cidade?.trim() ?? '',
    neighborhood: end.bairro?.trim() ?? '',
    address: end.completo?.trim() ?? '',
    price: i.valor,
    // A listagem só traz o valor do edital (= avaliação); sem desconto explícito.
    appraisalValue: null,
    discount: 0,
    financing: false,
    propertyType: tipo,
    saleModality: SALAS[i.sala.subtipo] ?? i.sala.subtipo,
    description: [i.entidadeProprietaria?.nome && `Proprietário: ${i.entidadeProprietaria.nome}`,
      i.dataSessao && `Sessão: ${i.dataSessao.replace('T', ' ')}`].filter(Boolean).join('. '),
    totalArea: null,
    privateArea: null,
    landArea: null,
    bedrooms: null,
    parkingSpaces: null,
    link: SITE + i.id + (i.idItemEdital ? `/${i.idItemEdital}` : ''),
  };
}
