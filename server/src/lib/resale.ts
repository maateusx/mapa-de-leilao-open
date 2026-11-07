/**
 * Origem Resale: resale.com.br (SPA React), outlet de imóveis de bancos e financeiras.
 * GET https://q3jhhgksa9.execute-api.us-east-2.amazonaws.com/prod/property?vendedor=<id>&order=data&limit=20&page=N
 *   → { data, pagination: { total_items, max_pages } }; 20 por página é o teto (limit maior é ignorado).
 * Exige o header "X-API-KEY", a chave pública embutida no bundle do site, e um User-Agent
 * de navegador completo: com "Mozilla/5.0" seco o WAF da AWS responde 403.
 * O catálogo todo (~3.450) leva ~4 min (a API é lenta, ~1,3 s por página), então só vamos
 * pelos vendedores bancários/financeiros, um filtro por vez.
 * Só imóveis; sem rate limit visto, 429 tratado como no Bradesco.
 */
import type { PropertyInput } from './sync.js';
import { toUf } from './bradesco.js';

const API = 'https://q3jhhgksa9.execute-api.us-east-2.amazonaws.com/prod/property';
const SITE = 'https://www.resale.com.br/imovel/';
const HEADERS = {
  'X-API-KEY': 'TFqvYJxuhO67Bo5WOzspQ6UENhuIZFVvrhLIcCig',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
};
// ponytail: lista fixa de vendedores (identificacao_vendedor_portal), vendedor novo fica de fora até entrar aqui.
// Fora: "Caixa - Venda Direta" (~970, já vem da origem caixa) e "Outros" (~1.400, a maioria
// "Proposta Rápida" sem banco identificado). Juntos dobrariam o tempo da sincronização.
const SELLERS = [
  '1a98aea5-ba3a-4d71-ae76-adc77bae510', // Sicoob (o id do portal vem com um caractere a menos mesmo)
  '25d87ddb-baa8-4ee3-a1c4-0c9848d73d73', // Banco de Brasília (BRB)
  '4ed450aa-7600-d4ef-95ed-5f4ea43a9dee', // EMGEA
  'bddbea7a-170c-4c95-a68e-537afd8aa1a9', // CNP Seguradora
  '71fced66-9cd2-4a87-8a0b-12fe6f9acfbd', // FHE/Poupex
  'fc60e595-80c6-4d47-b0e4-664cf1a365e2', // Banco Daycoval
  '7baf2c9f-4a47-4bca-9fd8-830b5558e56c', // FENABB
  '2b5ec857-d258-456e-87e7-34553aab1885', // Stars Bank
  'f32b6d3c-6ccd-422e-97e1-d16ee4eb8277', // Votorantim
  '6b50e87d-423c-4be6-a2b7-f65e8a60364f', // Disal Consórcios
  '94cd5537-8446-9352-94a7-5d1b6d8204e0', // Embracon
];

interface Item {
  id: string;
  foto_capa: string | null;
  nome_imovel: string; // "Casa, Residencial, 3 dormitório(s), 1 vaga(s) de garagem"
  descricao: string | null;
  tags: (string | null)[]; // ["IDR190794", "Desocupado", "Venda direta" | "Leilão" | "Melhor Proposta"...]
  tipo_imovel: string; // "Apartamento", "Casa_Condominio", "Loja_Salao_Comercial"...
  status_da_venda: string; // "ativo" | "encerrado"
  valores: { valor_avaliado: number; valor_venda: number };
  endereco: { endereco_completo: string; cidade: string; estado: string };
  caracteristicas: { dormitorios: string | null; vagas_garagem: string | null } | null;
  areas_total: { value: number } | null;
  vendedor: { name: string };
}

async function getPage(seller: string, page: number): Promise<{ data: Item[]; pagination: { max_pages: number } }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}?vendedor=${seller}&order=data&limit=20&page=${page}`, { headers: HEADERS });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? 60);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Resale: HTTP ${res.status} no vendedor ${seller}, página ${page}`);
    return res.json();
  }
}

export async function fetchResale(): Promise<PropertyInput[]> {
  const items = new Map<string, Item>(); // o id dedup caso a ordenação mude entre páginas
  for (const seller of SELLERS) {
    for (let page = 1, total = 1; page <= total; page++) {
      const res = await getPage(seller, page);
      for (const i of res.data) items.set(i.id, i);
      total = res.pagination.max_pages;
    }
  }
  return [...items.values()]
    .filter((i) => i.status_da_venda === 'ativo' && toUf(i.endereco?.estado) && i.valores?.valor_venda)
    .map(toProperty);
}

const orNull = (n: unknown) => Number(n) || null; // a API manda 0/"0" para "não informado"
/** "180.00 M² de área de terreno", "130.00 M² de área construída" */
const area = (desc: string, re: RegExp) => orNull(desc.match(re)?.[1]);
const MODALITIES = ['Venda direta', 'Leilão', 'Melhor Proposta', 'Proposta Rápida'];

function toProperty(i: Item): PropertyInput {
  const state = toUf(i.endereco.estado);
  const city = i.endereco.cidade?.trim() ?? '';
  const type = i.tipo_imovel.replace(/_Condominio$/, '').replace(/_/g, ' ') || 'Outros';
  const price = i.valores.valor_venda;
  const appraisal = orNull(i.valores.valor_avaliado);
  const discount = appraisal && appraisal > price ? (1 - price / appraisal) * 100 : 0;
  const desc = i.descricao?.trim() ?? '';
  const code = i.tags.find((t) => /^IDR\d+$/.test(t ?? ''));
  const modality = i.tags.find((t) => MODALITIES.includes(t ?? '')) ?? '';
  return {
    externalId: i.id,
    kind: 'realstate',
    title: `${type} - ${city}/${state}`,
    images: i.foto_capa ? [i.foto_capa] : [],
    state,
    city,
    neighborhood: '',
    // "Rua X, 1486, Parque Regina, São Paulo, (SP) São Paulo, 05775200,"
    address: i.endereco.endereco_completo?.replace(/,\s*$/, '').trim() ?? '',
    price,
    appraisalValue: appraisal,
    discount: Math.round(discount * 100) / 100,
    financing: false,
    propertyType: type,
    saleModality: [modality, i.vendedor.name].filter(Boolean).join(' - '), // "Venda direta - Sicoob"
    description: desc,
    totalArea: area(desc, /([\d.]+)\s*M² de área constru/i) ?? orNull(i.areas_total?.value),
    privateArea: area(desc, /([\d.]+)\s*M² de área privativa/i),
    landArea: area(desc, /([\d.]+)\s*M² de área de terreno/i),
    bedrooms: orNull(i.caracteristicas?.dormitorios),
    parkingSpaces: orNull(i.caracteristicas?.vagas_garagem),
    link: SITE + (code ?? i.id),
  };
}
