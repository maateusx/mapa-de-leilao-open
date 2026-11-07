/**
 * Origem Banco do Brasil: seuimovelbb.com.br (PHP, sem API JSON pública).
 * GET /catalogo → cookie PHPSESSID + token anti-CSRF na div #_cppnp.
 * POST /catalogo (form) pagina=N&ordem=2&contento=3&cppnp=<token>
 *   → { imoveis: "788", lista: "<html dos cards>" }, 200 por página (contento=3).
 * ordem=2 ("mais recente") é a única ordenação estável; por valor repete/pula itens.
 * O card traz preço, tipo, cidade/UF, modalidade e foto; a descrição (endereço,
 * áreas, lances do leilão) só existe na página do lote: GET /imovel/id/<id>.
 * Só imóveis. Cards "Aceita BB?" (faça sua oferta) não têm preço e ficam de fora.
 * Sem limite documentado; o 429, se vier, é tratado como no Bradesco.
 */
import { parseBrl } from './parse.js';
import { toUf } from './bradesco.js';
import type { PropertyInput } from './sync.js';

const SITE = 'https://www.seuimovelbb.com.br';
const PER_PAGE = 200;

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': 'Mozilla/5.0', ...init.headers } });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? 60);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`BB: HTTP ${res.status} em ${url}`);
    return res;
  }
}

const decode = (s: string) =>
  s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/\s*\n\s*/g, '\n').trim();
const text = (html: string, cls: string) => decode(html.match(new RegExp(`class="${cls}[^"]*">(.*?)</div>`, 's'))?.[1] ?? '');
const brl = (s: string | undefined) => parseBrl(s?.replace(/[^\d.,]/g, ''));
const area = (desc: string, re: RegExp) => parseBrl(desc.match(re)?.[1]);

export async function fetchBb(): Promise<PropertyInput[]> {
  const home = await get(`${SITE}/catalogo`);
  const cookie = home.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const token = (await home.text()).match(/id="_cppnp"[^>]*>([0-9a-f]+)/)?.[1];
  if (!token) throw new Error('BB: token #_cppnp não encontrado');

  const cards: string[] = [];
  for (let page = 1, total = 1; page <= total; page++) {
    const res = await get(`${SITE}/catalogo`, {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ pagina: String(page), ordem: '2', contento: '3', cppnp: token }),
    });
    const data: { imoveis: string; lista: string } = await res.json();
    cards.push(...data.lista.split('<div class="card carta">').slice(1));
    total = Math.ceil(Number(data.imoveis) / PER_PAGE);
  }

  const items: PropertyInput[] = [];
  for (const card of cards) {
    const id = card.match(/\/imovel\/id\/(\d+)/)?.[1];
    const [city, uf] = text(card, 'localidade').split(/ - (?=[A-Z]{2}$)/);
    const price = brl(text(card, 'valor').match(/R\$\s*([\d.,]+)/)?.[1]);
    if (!id || !toUf(uf) || !price) continue;
    // Página do lote: descrição livre, sequencial para não martelar o site.
    const page = await (await get(`${SITE}/imovel/id/${id}`)).text();
    items.push(toProperty(id, card, page, city, toUf(uf), price));
  }
  return items;
}

function toProperty(id: string, card: string, page: string, city: string, state: string, price: number): PropertyInput {
  const desc = decode(page.match(/<h4[^>]*>Descrição<\/h4>\s*<div[^>]*>(.*?)<\/div>/s)?.[1] ?? '');
  const type = text(card, 'tipo') || 'Outros';
  // Card visível é o que não está dentro de "d-none": "Leilão - ID 361" ou "Venda direta - ID 95733".
  const modality = card.match(/class="leilao pt-2 ">.*?<\/i>\s*([^-<]+?)\s*-/s)?.[1] ?? '';
  const rental = /<div class="row">\s*<div class="col-12 text-start">\s*<div class="venda-locacao/.test(card);
  // Leilão: o lance da 1ª praça serve de referência, como no Bradesco. Venda direta não informa avaliação.
  const reference = brl(desc.match(/1º leil[aã]o:?\s*R\$\s*([\d.,]+)/i)?.[1]) ?? null;
  const discount = reference && reference > price ? (1 - price / reference) * 100 : 0;
  // ponytail: endereço por regex ("Localização: ..." no leilão, "situada na ..." na venda direta).
  const address =
    desc.match(/Localiza[çc][aã]o:\s*([^\n]+)/i)?.[1] ??
    desc.match(/situad[ao] (?:na|no|à|a)\s+([^\n]+?)(?:,\s*(?:munic[ií]pio|melhor|com [aá]rea)|\.|\n)/i)?.[1] ??
    '';
  return {
    externalId: id,
    kind: 'realstate',
    title: `${type} - ${city}/${state}`,
    images: [`${SITE}/imagem/imovel/${id}_1.jpg`],
    state,
    city: city.trim(),
    neighborhood: '',
    address: address.trim(),
    price,
    appraisalValue: reference,
    discount: Math.round(discount * 100) / 100,
    financing: false, // o filtro de pagamento do site só oferece "À vista"
    propertyType: type,
    saleModality: rental ? `${modality} com locação simultânea` : modality,
    description: desc,
    // "área construída de 159,10m²", "área real privativa coberta de 50m²", "terreno com área total de 270,00m²"
    totalArea: area(desc, /[aá]rea (?:total |real )?(?:constru[ií]da|de constru[çc][aã]o)(?: privativa)? de\s*([\d.,]+)\s*m/i),
    privateArea: area(desc, /[aá]rea (?:real )?privativa\D{0,20}?de\s*([\d.,]+)\s*m/i),
    landArea: area(desc, /terreno (?:com )?(?:[aá]rea )?(?:total )?(?:de )?([\d.,]+)\s*m/i),
    bedrooms: null,
    parkingSpaces: null,
    link: `${SITE}/imovel/id/${id}`,
  };
}
