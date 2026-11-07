/**
 * Origem Caixa: baixa (ou recebe por upload) o CSV de imóveis e normaliza.
 *
 * O arquivo vem em ISO-8859-1, separado por ";", com uma linha de título antes
 * do cabeçalho. Existe um CSV por UF e um "geral" com todos.
 */
import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';
import { parseBrl, parseDecimal, parseBool, parseDescription } from './parse.js';
import type { PropertyInput } from './sync.js';

const BASE_URL = 'https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_';

export const CAIXA_UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

export const caixaCsvUrl = (uf: string) => `${BASE_URL}${uf}.csv`;

export async function fetchCaixa(): Promise<PropertyInput[]> {
  const res = await fetch(caixaCsvUrl('geral'), { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Download falhou: HTTP ${res.status}`);
  if (res.url.includes('perfdrive.com')) {
    throw new Error('A Caixa bloqueou o download com CAPTCHA (Radware). Baixe manualmente e envie o CSV.');
  }
  return parseCaixaCsv(Buffer.from(await res.arrayBuffer()));
}

export function parseCaixaCsv(buffer: Buffer): PropertyInput[] {
  const lines = iconv.decode(buffer, 'latin1').split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.includes('N') && l.includes('UF'));
  if (headerIdx < 0) throw new Error('Cabeçalho não encontrado — não parece um CSV da Caixa.');

  const rows = parse(lines.slice(headerIdx).join('\n'), {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const items: PropertyInput[] = [];
  for (const row of rows) {
    // Acesso por posição é mais robusto que pelos nomes acentuados das colunas.
    const [
      externalId, state, city, neighborhood, address,
      price, appraisal, discount, financing, description, modality, link,
    ] = Object.values(row);

    if (!externalId || !state) continue;
    const parsedPrice = parseBrl(price);
    if (parsedPrice == null) continue;

    items.push({
      externalId: externalId.trim(),
      kind: 'realstate',
      state: state.trim(),
      city: city?.trim() ?? '',
      neighborhood: neighborhood?.trim() ?? '',
      address: address?.trim() ?? '',
      price: parsedPrice,
      appraisalValue: parseBrl(appraisal),
      discount: parseDecimal(discount) ?? 0,
      financing: parseBool(financing),
      description: description?.trim() ?? '',
      saleModality: modality?.trim() ?? '',
      link: link?.trim() ?? '',
      ...parseDescription(description),
    });
  }
  return items;
}
