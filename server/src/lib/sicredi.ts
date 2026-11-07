/**
 * Origem Sicredi: vitrine de bens não de uso das cooperativas ("Imóveis e Veículos"
 * do Shopping Sicredi), SPA em imoveiseveiculos.app.sicredi.com.br.
 * GET <BFF>/filtros/aprovados → array com TODOS os bens aprovados, sem imagens (~400 KB).
 * Não precisa paginar: a busca paginada do site (/filtros/pesquisa-paginada) devolve
 * só 9 por página e com as fotos em base64 (MB por página).
 * Fotos só existem em base64 na API (/bem-imagens/:id), sem URL pública: ficam de fora.
 * Preço: "INICIAL" (valor inicial sujeito a aprovação), "FECHADO" (valor fixo) ou
 * "NEGOCIAR" (sem valor, descartado). Não há valor de avaliação.
 */
import type { PropertyInput } from './sync.js';
import { parseVehicle, toUf } from './bradesco.js';

const API = 'https://api.sicredi.io/api/v1/public/propertyandvehicle-bff/filtros/aprovados';
const SITE = 'https://imoveiseveiculos.app.sicredi.com.br/vitrine-detalhe?bem=';

interface Bem {
  id: string;
  segmento: 'IMOVEL' | 'VEICULO' | 'MAQUINA';
  titulo: string;
  descricao: string | null;
  codigo: string;
  cooperativa: { nomeFantasia: string } | null; // às vezes só o código ("0726")
  localizacao: { uf: string; logradouro: string; numero: string; bairro: string; cidade: string } | null;
  tipo: string; // "Terreno", "Casa", "Caminhão", "Trator"...
  preco: { tipo: 'INICIAL' | 'FECHADO' | 'NEGOCIAR'; valor: number } | null;
  area?: number; // imóveis: área em m² (0 = não informado)
  quartos?: number;
  ano?: number; // veículos e máquinas
  marca?: { tipo: string };
  kilometragem?: number;
}

const KIND: Record<string, string> = { IMOVEL: 'realstate', VEICULO: 'vehicles', MAQUINA: 'equipments' };
const MODALITY: Record<string, string> = {
  INICIAL: 'Venda Direta - valor inicial (sujeito a aprovação)',
  FECHADO: 'Venda Direta',
};

export async function fetchSicredi(): Promise<PropertyInput[]> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(API, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? 60);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    break;
  }
  if (!res.ok) throw new Error(`Sicredi: HTTP ${res.status}`);
  const bens: Bem[] = await res.json();
  return bens.filter((b) => KIND[b.segmento] && toUf(b.localizacao?.uf ?? null) && b.preco?.valor).map(toProperty);
}

function toProperty(b: Bem): PropertyInput {
  const loc = b.localizacao!;
  const kind = KIND[b.segmento];
  const desc = b.descricao?.trim() ?? '';
  const title = b.titulo.trim();
  const coop = b.cooperativa?.nomeFantasia;
  return {
    externalId: b.id,
    kind,
    title,
    images: [],
    state: toUf(loc.uf),
    city: loc.cidade?.trim() ?? '',
    neighborhood: loc.bairro?.trim() ?? '',
    address: [loc.logradouro, loc.numero].map((s) => s?.trim()).filter(Boolean).join(', '),
    price: b.preco!.valor,
    appraisalValue: null,
    discount: 0,
    financing: false,
    propertyType: b.tipo || 'Outros',
    saleModality: MODALITY[b.preco!.tipo] ?? '',
    // Cooperativa vendedora ajuda o comprador a achar o contato.
    description: [desc, coop && !/^\d+$/.test(coop) ? `Cooperativa: ${coop}` : ''].filter(Boolean).join('\n'),
    totalArea: kind === 'realstate' ? b.area || null : null,
    privateArea: null,
    landArea: null,
    bedrooms: b.quartos || null,
    parkingSpaces: null,
    link: SITE + b.id,
    ...(kind === 'realstate'
      ? {}
      : {
          ...parseVehicle(title, desc),
          // A API já traz os campos estruturados; o título ("FORD/CARGO 2429") não segue o padrão do Bradesco.
          brand: b.marca?.tipo || null,
          model: title,
          year: b.ano || null,
          manufactureYear: b.ano || null,
          km: b.kilometragem || null,
        }),
  };
}
