import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewMode = 'grid' | 'list' | 'map';

export interface Filters {
  search: string;
  kind: string;
  state: string;
  city: string;
  propertyType: string;
  saleModality: string;
  origin: string;
  brand: string;
  fuel: string;
  minYear?: number;
  maxKm?: number;
  financing: 'all' | 'true' | 'false';
  minPrice?: number;
  maxPrice?: number;
  minDiscount?: number;
  sort: string;
  order: 'asc' | 'desc';
  page: number;
  /** Área visível do mapa (oeste,sul,leste,norte); só vale na visão de mapa. */
  bbox: string;
}

export const DEFAULT_FILTERS: Filters = {
  search: '',
  kind: '',
  state: '',
  city: '',
  propertyType: '',
  saleModality: '',
  origin: '',
  brand: '',
  fuel: '',
  minYear: undefined,
  maxKm: undefined,
  financing: 'all',
  minPrice: undefined,
  maxPrice: undefined,
  minDiscount: undefined,
  sort: 'discount',
  order: 'desc',
  page: 1,
  bbox: '',
};

interface FilterState extends Filters {
  view: ViewMode;
  setView: (view: ViewMode) => void;
  /** Atualiza filtros; qualquer mudança (exceto a própria página) volta à página 1. */
  set: (patch: Partial<Filters>) => void;
  reset: () => void;
}

/** Filtros ficam salvos no navegador (localStorage) até o usuário limpar. */
export const useFilters = create<FilterState>()(
  persist(
    (set) => ({
      ...DEFAULT_FILTERS,
      view: 'grid',
      setView: (view) => set({ view }),
      set: (patch) =>
        set((state) => ({
          ...state,
          ...patch,
          page: 'page' in patch ? (patch.page as number) : 1,
        })),
      reset: () => set((state) => ({ ...DEFAULT_FILTERS, bbox: state.bbox })),
    }),
    {
      name: 'leilao-filtros',
      // Página e área do mapa são passageiras; o resto (filtros, ordenação, visão) persiste.
      partialize: ({ page, bbox, set, setView, reset, ...keep }) => keep,
    }
  )
);

/** Converte os filtros do store nos query params da API (omitindo vazios). */
export function filtersToParams(f: FilterState | Filters) {
  return {
    search: f.search || undefined,
    kind: f.kind || undefined,
    state: f.state || undefined,
    city: f.city || undefined,
    propertyType: f.propertyType || undefined,
    saleModality: f.saleModality || undefined,
    origin: f.origin || undefined,
    brand: f.brand || undefined,
    fuel: f.fuel || undefined,
    minYear: f.minYear,
    maxKm: f.maxKm,
    financing: f.financing === 'all' ? undefined : f.financing,
    minPrice: f.minPrice,
    maxPrice: f.maxPrice,
    minDiscount: f.minDiscount,
    sort: f.sort,
    order: f.order,
    page: f.page,
    limit: 24,
    bbox: 'view' in f && f.view === 'map' ? f.bbox || undefined : undefined,
  };
}
