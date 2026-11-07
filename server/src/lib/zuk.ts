/**
 * Origem Portal Zuk: portalzuk.com.br (Laravel, HTML renderizado no servidor, sem API JSON).
 * GET /leilao-de-imoveis (e /leilao-de-veiculos) → cookie de sessão, _token CSRF, "var countLotes"
 * (total) e os 30 primeiros cards. O botão "Carregar mais" faz
 * POST /leilao-de-imoveis/mais (form) limit=<cards já carregados>&path=<url da lista>&order=data_leilao&_token
 *   → html de mais 30 cards. Sem token/cookie dá 419.
 * O POST tem throttle (~10 seguidos, depois ~1 a cada 3-4 s) e o 429 vem sem retry-after:
 * espera 4 s e tenta de novo. Os ~1.000 imóveis levam ~2 min; é o grosso do sync.
 * A página de imóveis também traz "var properties = [...]" (pins do mapa) com áreas, quartos,
 * vagas e o "% abaixo" da avaliação de todos os lotes: usado para completar os cards.
 * "Aberto para proposta" (sem preço) fica de fora, assim como /leilao-de-bens-diversos
 * (móveis, eletrodomésticos: sem chave em KINDS). Alguns cards são de parceiros (Kwara)
 * e apontam para o site deles. robots.txt só bloqueia /ajax-lote* e /ajax-modal*.
 */
import { parseBrl } from './parse.js';
import { parseVehicle, toUf } from './bradesco.js';
import type { PropertyInput } from './sync.js';

const SITE = 'https://www.portalzuk.com.br';
const LISTS: Record<string, string> = { 'leilao-de-imoveis': 'realstate', 'leilao-de-veiculos': 'vehicles' };
const CARD = '<div class="card-property card_lotes_div"';

/** Pin do mapa: a_* em m², if_* = -1 quando não informado, i_abaixo = % abaixo da avaliação. */
interface Pin { ilo: number; a_pri: number; a_con: number; a_ter: number; if_dorm: number; if_vag: number; i_abaixo: number }

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': 'Mozilla/5.0', ...init.headers } });
    if (res.status === 429 && attempt < 30) {
      const wait = Number(res.headers.get('retry-after') ?? 4);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Zuk: HTTP ${res.status} em ${url}`);
    return res;
  }
}

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export async function fetchZuk(): Promise<PropertyInput[]> {
  const items: PropertyInput[] = [];
  for (const [path, kind] of Object.entries(LISTS)) {
    const home = await request(`${SITE}/${path}`);
    const cookie = home.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const html = await home.text();
    const token = html.match(/name="_token" value="([^"]+)"/)?.[1];
    if (!token) throw new Error('Zuk: _token não encontrado');
    const total = Number(html.match(/var countLotes = "(\d+)"/)?.[1] ?? 0);
    const pins = new Map<string, Pin>(
      JSON.parse(html.match(/var properties = +(\[.*?\])\s*;/s)?.[1] ?? '[]').map((p: Pin) => [String(p.ilo), p])
    );

    const cards = html.split(CARD).slice(1);
    while (cards.length < total) {
      const res = await request(`${SITE}/leilao-de-imoveis/mais`, {
        method: 'POST',
        headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ limit: String(cards.length), path: `${SITE}/${path}`, order: 'data_leilao', _token: token }),
      });
      const more = (await res.text()).split(CARD).slice(1);
      if (!more.length) break; // total muda durante o sync
      cards.push(...more);
    }
    for (const card of cards) {
      const item = toProperty(card, kind, pins);
      if (item) items.push(item);
    }
  }
  // Um lote pode reaparecer se a ordem mudar entre as páginas.
  return [...new Map(items.map((i) => [i.externalId, i])).values()];
}

function toProperty(card: string, kind: string, pins: Map<string, Pin>): PropertyInput | null {
  // Lote do próprio Zuk: /imovel/sp/sao-paulo/.../37869-236630 ou /veiculo/37879-236693; parceiro: data-url-externa.
  const own = card.match(/href="(https:\/\/www\.portalzuk\.com\.br\/[^"]+-(\d+))"/);
  const id = own?.[2] ?? card.match(/data-idlote="(\d+)"/)?.[1];
  const link = own?.[1] ?? card.match(/data-url-externa="([^"]+)"/)?.[1];
  // Praças já encerradas vêm riscadas (line-through): o preço vigente é a primeira não riscada.
  const prices = [...card.matchAll(/price-value">R\$\s*(<span style='text-decoration:line-through;'>)?\s*([\d.,]+)/g)];
  const current = prices.find((m) => !m[1]);
  const price = parseBrl(current?.[2]);
  // Endereço: "São Paulo / SP - Tatuapé" + rua (imóvel); no veículo o 1º span é a descrição.
  const spans = [...(card.match(/<address[^>]*>(.*?)<\/address>/s)?.[1] ?? '').matchAll(/<span([^>]*)>(.*?)<\/span>/gs)]
    .map((m) => decode(m[1].match(/title="([^"]*)"/)?.[1] ?? m[2])); // o texto visível vem truncado ("placa...")
  const loc = spans.findIndex((s) => / \/ [A-Z]{2}\b/.test(s));
  const [, city = '', uf = '', neighborhood = ''] = spans[loc]?.match(/^(.+?) \/ ([A-Z]{2})(?: - (.*))?$/) ?? [];
  if (!id || !link || !price || !toUf(uf)) return null;

  const pin = pins.get(id);
  // Com 2+ praças, a 1ª é a referência de avaliação (como no Bradesco); com preço único,
  // o site mostra o "% abaixo" da avaliação e o pin traz o valor exato.
  const first = prices.length > 1 ? parseBrl(prices[0][2]) : null;
  const reference = first ?? (pin && pin.i_abaixo > 0 && pin.i_abaixo < 100 ? Math.round(price / (1 - pin.i_abaixo / 100)) : null);
  const discount = reference && reference > price ? (1 - price / reference) * 100 : 0;
  const type = decode(card.match(/card-property-price-lote">(.*?)<\/span>/s)?.[1] ?? '') || 'Outros';
  // alt da foto: "Apartamentos e Flats em leilão - Rua X, 767 - São Paulo/SP - Banco Itaú | Z37738"
  const alt = decode(card.match(/\salt="([^"]*)"/)?.[1] ?? '');
  const seller = alt.match(/ - ([^-|]+?) \| Z\d+/)?.[1] ?? '';
  const image = card.match(/<img src="([^"]+)"/)?.[1];
  const area = (n: number | undefined) => n || null;
  const count = (n: number | undefined) => (n === undefined || n < 0 ? null : n);
  const isVehicle = kind === 'vehicles';
  const desc = isVehicle ? spans[0] ?? '' : '';
  return {
    externalId: id,
    kind,
    title: isVehicle ? desc : `${type} - ${city}/${uf}`,
    images: image && !image.includes('ImgNaoDisp') ? [image.replace('/mini/', '/detalhe/')] : [],
    state: toUf(uf),
    city: city.trim(),
    neighborhood: neighborhood.trim(),
    address: isVehicle ? '' : spans[loc + 1] ?? '',
    price,
    appraisalValue: reference,
    discount: Math.round(discount * 100) / 100,
    financing: false,
    propertyType: type,
    saleModality: /tribunal|justi[çc]a/i.test(seller) ? 'Leilão Judicial' : 'Leilão Extrajudicial',
    description: [seller && `Comitente: ${seller}`, desc].filter(Boolean).join('\n'),
    totalArea: area(pin?.a_con),
    privateArea: area(pin?.a_pri),
    landArea: area(pin?.a_ter),
    bedrooms: count(pin?.if_dorm),
    parkingSpaces: count(pin?.if_vag),
    link,
    ...(isVehicle ? vehicle(alt, desc) : {}),
  };
}

/**
 * Marca vem do alt ("Veículos - VW em leilão"); a descrição é "Carro, Fiat/Palio Fire Flex, cor branca, 2014/2015, placas ...".
 * ponytail: modelo = 2º trecho da descrição sem o prefixo da marca; formatos fora disso ficam com modelo nulo.
 */
function vehicle(alt: string, desc: string) {
  const brand = alt.match(/^[^-]+- (.+?) em leil/)?.[1] ?? '';
  let model = desc.split(',')[1]?.trim().replace(/^[^\s/]+\//, '') ?? ''; // "Fiat/Palio" → "Palio"
  if (model.toLowerCase().startsWith(brand.toLowerCase() + ' ')) model = model.slice(brand.length + 1); // "VW Golf" → "Golf"
  const years = desc.match(/(\d{4})\s*\/\s*(\d{4})/);
  const name = brand && model && !/^\d{4}/.test(model) && years ? `${brand} - ${model} - ${years[1]} / ${years[2]}` : desc;
  return parseVehicle(name, desc);
}
