/**
 * Origem Banrisul: "Bens à venda" em banrisul.com.br/bob/site/link/bens-a-venda.html.
 * Cada categoria (residenciais, comerciais, terrenos, móveis) carrega os cards de
 * arquivos estáticos blocoSistemaB_<pagina>_<bloco>_<N>.txt (N = 0, 1, 2...), um JSON
 * { "id_<conteudo>;<data>;-1": "<html do card>" }. Acabou quando o arquivo dá 302/404.
 * O card já tem título, endereço, valor e número do bem: não precisa abrir o detalhe.
 * Preço: "Valor mínimo de venda" (venda direta, leilão público, licitação) ou
 * "Valor 1º/2º Leilão" (leilão extrajudicial). Só RS/SC na prática.
 */
import type { PropertyInput } from './sync.js';
import { parseBrl } from './parse.js';
import { parseVehicle, toUf } from './bradesco.js';

const BASE = 'https://www.banrisul.com.br/bob/site/link/';
const BLOCKS: [string, string][] = [
  ['2395_6113', 'realstate'], // venda-imoveis-residenciais.html
  ['2397_6116', 'realstate'], // venda-imoveis-comerciais.html
  ['2399_6118', 'realstate'], // venda-imoveis-terrenos.html
  ['2424_6249', 'vehicles'], // venda-moveis.html
];

async function getFile(block: string, n: number): Promise<Record<string, string> | null> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}blocoSistemaB_${block}_${n}.txt`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'manual', // arquivo inexistente redireciona para a página de erro
    });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? 60);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    if (res.status === 200) return res.json();
    if (res.status >= 300 && res.status < 500) return null;
    throw new Error(`Banrisul: HTTP ${res.status} em ${block}_${n}`);
  }
}

export async function fetchBanrisul(): Promise<PropertyInput[]> {
  const items: PropertyInput[] = [];
  for (const [block, kind] of BLOCKS) {
    for (let n = 0; ; n++) {
      const file = await getFile(block, n);
      if (!file) break;
      for (const [key, html] of Object.entries(file)) {
        const item = toProperty(key.split(';')[0].replace('id_', ''), html, kind);
        if (item) items.push(item);
      }
    }
  }
  return items;
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', ordm: 'º', ordf: 'ª', ndash: '–', mdash: '—' };
/** HTML do card → texto corrido. As entidades acentuadas são do tipo &atilde; &ccedil;. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(\w+);/g, (m, e: string) => {
      if (ENTITIES[e]) return ENTITIES[e];
      const accent = { acute: '\u0301', grave: '\u0300', tilde: '\u0303', circ: '\u0302', cedil: '\u0327', uml: '\u0308' };
      const k = Object.keys(accent).find((a) => e.endsWith(a) && e.length === a.length + 1);
      return k ? (e[0] + accent[k as keyof typeof accent]).normalize('NFC') : m;
    })
    .replace(/\s+/g, ' ')
    .trim();

const money = (s: string, re: RegExp) => parseBrl(s.match(re)?.[1]);
const date = (s: string | undefined) => (s ? new Date(s.split('/').reverse().join('-') + 'T23:59:59-03:00') : null);

function toProperty(contentId: string, html: string, kind: string): PropertyInput | null {
  const title = text(html.match(/data-titulo="([^"]*)"/)?.[1] ?? '');
  const body = text(html.match(/<div class="card-body[^>]*>([\s\S]*)<\/div>/)?.[1] ?? '');
  // Vendidos ficam no ar com "VENDIDO" no título e o valor riscado.
  if (/vendido/i.test(title) || !/à venda/i.test(body)) return null;

  const address = body.match(/Endereço:\s*(.*?)(?=\s*Valor|\s*Número|$)/)?.[1]?.replace(/\.$/, '') ?? '';
  // "... Porto Alegre/RS" no endereço ou no título; o data-agrupamento ("Estado/Cidade") às vezes erra a UF.
  const place = (address + ' ' + title).match(/([^,.–]+?)\s*\/\s*([A-Z]{2})\b/);
  const [group0, group1] = (html.match(/data-agrupamento="([^"]*)"/)?.[1] ?? '').split('/');
  const state = toUf(place?.[2] ?? group0);
  const city = place?.[1]?.split(/\s+-\s+/).pop()?.trim().replace(/^na cidade de\s*/i, '').trim() || group1?.trim() || '';

  // Leilão extrajudicial: vale o 1º leilão até a data dele, depois o 2º.
  const first = money(body, /Valor 1º\s*Leilão:\s*R\$\s*([\d.,]+)/i);
  const second = money(body, /Valor 2º\s*Leilão:\s*R\$\s*([\d.,]+)/i);
  const firstEnd = date(body.match(/1º\s*Leilão:.*?Encerramento em (\d{2}\/\d{2}\/\d{4})/i)?.[1]);
  const minimum = money(body, /Valor mínimo de venda:\s*R\$\s*([\d.,]+)/i);
  const price = (first && second && firstEnd && firstEnd < new Date() ? second : first) ?? minimum ?? 0;
  const detail = html.match(/abrirPaginaDetalhe\('([^']+)'/)?.[1]; // "venda-imoveis-residenciais-detalhe"
  if (!state || !price || !detail) return null;
  // Na alienação fiduciária o 1º leilão não pode ser menor que a avaliação: usado como referência (igual ao Bradesco).
  const discount = first && first > price ? (1 - price / first) * 100 : 0;

  const parts = title.split(' - ').map((s) => s.trim());
  const number = body.match(/Número do (?:Imóvel|bem):\s*(\d+)/i)?.[1];
  const image = html.match(/<img src="\.\.\/link\/([^"]+)"/)?.[1];
  return {
    externalId: number ?? contentId,
    kind,
    title,
    images: image ? [BASE + encodeURI(image)] : [],
    state,
    city,
    neighborhood: address.match(/bairro\s+([^,.]+)/i)?.[1]?.trim() ?? '',
    address,
    price,
    appraisalValue: first,
    discount: Math.round(discount * 100) / 100,
    financing: false,
    // "Sala Comercial nº 414", "Lote 05", "Loja 101- Bairro..." → sem o número.
    propertyType: parts[1]?.replace(/\s*(n[º°]\s*|com\s+)?\d.*$/i, '').replace(/^\p{Ll}/u, (c) => c.toUpperCase()) || 'Outros',
    // "Leilão Extrajudicial Casa isolada..." às vezes vem sem o " - "; "Venda direta" → "Venda Direta".
    saleModality: parts[0].replace(/^(Leilão Extrajudicial).*/i, '$1').replace(/(^|\s)\p{Ll}/gu, (c) => c.toUpperCase()),
    description: body.replace(/\s*À VENDA.*$/i, ''),
    totalArea: null,
    privateArea: null,
    landArea: null,
    bedrooms: Number(title.match(/(\d+)\s*(?:dormit|suíte)/i)?.[1]) || null,
    parkingSpaces: null,
    link: `${BASE}${detail}_${contentId}.html`,
    ...(kind === 'realstate' ? {} : parseVehicle(title, body)),
  };
}
