const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

export interface Property {
  _id: string;
  origin: string;
  kind: string;
  externalId: string;
  title: string;
  images: string[];
  state: string;
  city: string;
  neighborhood: string;
  address: string;
  price: number;
  appraisalValue: number | null;
  discount: number;
  financing: boolean;
  propertyType: string;
  saleModality: string;
  description: string;
  totalArea: number | null;
  privateArea: number | null;
  landArea: number | null;
  bedrooms: number | null;
  parkingSpaces: number | null;
  link: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  manufactureYear: number | null;
  km: number | null;
  fuel: string | null;
  color: string | null;
  damage: string | null;
}

export interface PropertyList {
  items: Property[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FilterOptions {
  kinds: { key: string; name: string }[];
  brands: string[];
  fuels: string[];
  states: string[];
  propertyTypes: string[];
  saleModalities: string[];
  origins: { key: string; name: string }[];
  priceRange: { min: number; max: number };
}

export interface SyncRun {
  _id: string;
  origin: string;
  source: 'auto' | 'upload';
  status: 'running' | 'ok' | 'error';
  file: string;
  states: string[];
  imported: number;
  removed: number;
  error: string;
  createdAt: string;
}

export interface SyncInfo {
  origins: { key: string; name: string }[];
  runs: SyncRun[];
  links: { uf: string; url: string }[];
}

async function post<T>(path: string, body?: Blob, params?: Record<string, string>): Promise<T> {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: 'POST',
    body,
    headers: body ? { 'Content-Type': 'text/csv' } : undefined,
  });
  if (!res.ok) throw new Error(`Erro ${res.status} em ${path}`);
  return res.json() as Promise<T>;
}

async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const url = new URL(API_URL + path);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erro ${res.status} ao buscar ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  listProperties: (params: Record<string, unknown>) =>
    get<PropertyList>('/api/properties', params),
  /** [id, lat, lng, preço, 1 = endereço / 0 = centro da cidade] */
  getMapPoints: (params: Record<string, unknown>) =>
    get<[string, number, number, number, 0 | 1][]>('/api/properties/map', params),
  getProperty: (id: string) => get<Property>(`/api/properties/${id}`),
  getFilterOptions: (kind?: string) => get<FilterOptions>('/api/properties/meta/filters', { kind }),
  getCities: (state?: string) =>
    get<{ cities: string[] }>('/api/properties/meta/cities', { state }),
  getSync: () => get<SyncInfo>('/api/sync'),
  runSync: (origin: string) => post<SyncRun>('/api/sync/run', undefined, { origin }),
  uploadSync: (file: File) => post<SyncRun>('/api/sync/upload', file, { file: file.name }),
};
