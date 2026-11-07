const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

export function formatCurrency(value?: number | null) {
  if (value == null) return '—';
  return brl.format(value);
}

export function formatArea(value?: number | null) {
  if (value == null || value === 0) return null;
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m²`;
}

export function formatKm(value?: number | null) {
  if (!value) return null;
  return `${value.toLocaleString('pt-BR')} km`;
}

/** 2017/2018, ou só 2018 quando fabricação = modelo. */
export function formatYear(p: { year: number | null; manufactureYear: number | null }) {
  if (!p.year) return null;
  return p.manufactureYear && p.manufactureYear !== p.year ? `${p.manufactureYear}/${p.year}` : String(p.year);
}

export function formatDiscount(value?: number | null) {
  if (!value) return null;
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% OFF`;
}

const brlShort = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** "R$ 120 mil", "R$ 1,2 mi": preço no marcador do mapa. */
export function formatCurrencyShort(value: number) {
  return brlShort.format(value);
}
