/**
 * Agrupa categorias (propertyType) que são a mesma coisa escrita diferente:
 * "Sítio", "SITIO", "Sítios", "Chácara / Sítio"... viram um único grupo.
 * O frontend vê um rótulo por grupo; o filtro expande para todas as variantes.
 */

/** Sinônimos (já normalizados, singular) → chave do grupo. Edite à vontade. */
const ALIASES: [RegExp, string][] = [
  [/^(chacara|sitio)\b/, 'chacara / sitio'],
  [/^(box \/ )?vaga( de garagem)?$|^box garagem$/, 'vaga de garagem'],
  [/^apartamento \/ flat$/, 'apartamento'],
  [/^terreno \/ lote$/, 'terreno'],
  [/^imovel rural$|^area rural$/, 'rural'],
  [/^imovel comercial$/, 'comercial'],
  [/^motocicleta$/, 'moto'],
];

/** Rótulo fixo para grupos de sinônimos (os demais usam a variante mais comum). */
export const ALIAS_LABELS: Record<string, string> = {
  'chacara / sitio': 'Chácara / Sítio',
  'vaga de garagem': 'Vaga de garagem',
};

function singular(word: string) {
  if (word.length <= 3) return word;
  return word
    .replace(/oes$/, 'ao')
    .replace(/aes$/, 'ao')
    .replace(/ais$/, 'al')
    .replace(/eis$/, 'el')
    .replace(/(ch|r|z)es$/, '$1')
    .replace(/s$/, '');
}

/** Chave canônica: sem acento, minúscula, espaços colapsados, palavras no singular, sinônimos. */
export function categoryKey(raw: string) {
  const key = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(singular)
    .join(' ');
  return ALIASES.find(([re]) => re.test(key))?.[1] ?? key;
}

/** Agrupa variantes → [{ label, values }], rótulo = alias fixo ou a variante com mais itens. */
export function groupCategories(counts: { _id: string; n: number }[]) {
  const groups = new Map<string, { best: string; bestN: number }>();
  for (const { _id, n } of counts) {
    if (!_id?.trim()) continue;
    const k = categoryKey(_id);
    const g = groups.get(k);
    if (!g || n > g.bestN) groups.set(k, { best: _id.trim(), bestN: n });
  }
  return [...groups.entries()]
    .map(([k, g]) => ALIAS_LABELS[k] ?? g.best)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Expande rótulos escolhidos para todas as variantes cruas do banco. */
export function expandCategories(labels: string[], allRaw: string[]) {
  const keys = new Set(labels.map(categoryKey));
  return allRaw.filter((r) => r && keys.has(categoryKey(r)));
}
