/**
 * Utilidades para normalizar os dados crus do CSV da Caixa.
 */

/** "62.592,83" -> 62592.83 ; "" -> null */
export function parseBrl(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "58.28" -> 58.28 (o desconto já vem com ponto decimal) */
export function parseDecimal(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function parseBool(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase().startsWith('s');
}

/**
 * Extrai informações estruturadas da descrição da Caixa, por ex.:
 * "Casa, 111.70 de área total, 111.70 de área privativa, 300.00 de área do
 *  terreno, 3 qto(s), a.serv, WC, 1 sala(s), cozinha, 1 vaga(s) de garagem."
 */
export function parseDescription(description: string) {
  const desc = (description ?? '').trim();
  const propertyType = desc.split(',')[0]?.trim() || 'Outros';

  const num = (re: RegExp): number | null => {
    const m = desc.match(re);
    if (!m) return null;
    const n = Number(m[1].replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  return {
    propertyType,
    totalArea: num(/([\d.,]+)\s+de área total/i),
    privateArea: num(/([\d.,]+)\s+de área privativa/i),
    landArea: num(/([\d.,]+)\s+de área do terreno/i),
    bedrooms: num(/(\d+)\s+qto/i),
    parkingSpaces: num(/(\d+)\s+vaga/i),
  };
}
