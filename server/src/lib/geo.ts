/**
 * Coordenadas para o mapa, sem custo:
 * 1. Todo lote com cidade recebe o centro do município (data/municipios.csv, IBGE).
 * 2. Quem tem endereço passa pelo Nominatim (OpenStreetMap), 1 requisição/s
 *    (política de uso deles), com cache por endereço na coleção `geocodes`.
 *    Resultado longe do município ou só no nível da cidade é descartado: o lote
 *    fica no centro da cidade.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { Schema, model } from 'mongoose';
import { Property } from '../models/Property.js';

const Geocode = model(
  'Geocode',
  new Schema({ _id: String, lat: Number, lng: Number }, { timestamps: true }) // lat null = não achou
);

/** "São Gonçalo" e "SAO GONCALO" viram a mesma chave. */
export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

const CITIES = new Map<string, [number, number]>(
  (parse(readFileSync(new URL('../../data/municipios.csv', import.meta.url)), { columns: true }) as
    { uf: string; nome: string; lat: string; lng: string }[]
  ).map((r) => [`${r.uf}|${norm(r.nome)}`, [Number(r.lat), Number(r.lng)]])
);

/** Aceita "Americana - SP"; no DF, Taguatinga/Ceilândia etc. (regiões, não municípios) caem em Brasília. */
export const cityCoords = (state: string, city: string) =>
  CITIES.get(`${state}|${norm(city.replace(/\s+-\s+[A-Z]{2}$/, ''))}`) ??
  (state === 'DF' && city ? CITIES.get('DF|BRASILIA') : undefined);

/** Centro do município para quem ainda não tem coordenada. */
export async function assignCityCoords() {
  const pairs = await Property.aggregate<{ _id: { state: string; city: string } }>([
    { $match: { lat: null } },
    { $group: { _id: { state: '$state', city: '$city' } } },
  ]);
  let updated = 0;
  for (const { _id } of pairs) {
    const c = cityCoords(_id.state, _id.city ?? '');
    if (!c) continue;
    const r = await Property.updateMany(
      { state: _id.state, city: _id.city, lat: null },
      { $set: { lat: c[0], lng: c[1], geo: 'city' } }
    );
    updated += r.modifiedCount;
  }
  return updated;
}

/**
 * "RUA NAZARE, N. 72, Apto 32," → "72 RUA NAZARE" (formato do `street` do Nominatim).
 * Complementos (apto, bloco, lote, quadra) atrapalham a busca e são descartados.
 * null quando não há rua utilizável.
 */
export function cleanStreet(address: string): string | null {
  const [first = '', second = ''] = address.replace(/\(.*?\)/g, ' ').split(',').map((p) => p.trim());
  const street = first.replace(/\s+/g, ' ');
  if (street.length < 5 || /PROJETADA|^QUADRA|^QD\b|^LOTE|^VIA DE ACESSO/i.test(street)) return null;
  const num = second.match(/^(?:N\.?\s*)?(\d+)$/i)?.[1];
  return num && Number(num) > 0 ? `${num} ${street}` : street;
}

const km = (a: [number, number], b: [number, number]) => {
  const rad = Math.PI / 180;
  const x = (b[1] - a[1]) * rad * Math.cos(((a[0] + b[0]) / 2) * rad);
  const y = (b[0] - a[0]) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
};

// Nível de cidade ou maior: não melhora o centro do município.
const COARSE = new Set(['city', 'town', 'municipality', 'county', 'state', 'region', 'country', 'state_district']);
const MAX_KM = 60; // ponytail: raio fixo; municípios gigantes da Amazônia podem perder acertos legítimos

async function nominatim(street: string, city: string, state: string): Promise<[number, number] | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  for (const [k, v] of Object.entries({ street, city, state, country: 'Brasil', format: 'jsonv2', limit: '1' }))
    url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'User-Agent': 'leilao-imoveis/1.0 (self-hosted side project)' } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const [hit] = (await res.json()) as { lat: string; lon: string; addresstype: string }[];
  if (!hit || COARSE.has(hit.addresstype)) return null;
  return [Number(hit.lat), Number(hit.lon)];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Geocodifica até `limit` lotes pendentes. Devolve quantos processou. */
export async function geocodeAddresses(limit = 500) {
  const pending = await Property.find(
    { geo: 'city', geoTried: { $ne: true }, address: { $gt: '' } },
    { address: 1, city: 1, state: 1, lat: 1, lng: 1 }
  ).limit(limit).lean();

  for (const p of pending) {
    const street = cleanStreet(p.address);
    let coords: [number, number] | null = null;
    if (street) {
      const key = `${p.state}|${norm(p.city)}|${norm(street)}`;
      const cached = await Geocode.findById(key).lean();
      if (cached) {
        coords = cached.lat == null ? null : [cached.lat, cached.lng!];
      } else {
        coords = await nominatim(street, p.city, p.state);
        if (coords && km(coords, [p.lat!, p.lng!]) > MAX_KM) coords = null;
        await Geocode.updateOne({ _id: key }, { lat: coords?.[0] ?? null, lng: coords?.[1] ?? null }, { upsert: true });
        await sleep(1100);
      }
    }
    await Property.updateOne(
      { _id: p._id },
      { $set: { geoTried: true, ...(coords && { lat: coords[0], lng: coords[1], geo: 'address' }) } }
    );
  }
  return pending.length;
}

/** Loop em segundo plano: cidades primeiro (instantâneo), depois endereços aos poucos. */
export function scheduleGeocoding(log: (msg: string) => void) {
  const loop = async () => {
    for (;;) {
      try {
        const cities = await assignCityCoords();
        if (cities) log(`Geo: ${cities} lotes no centro da cidade`);
        let done: number;
        while ((done = await geocodeAddresses()) > 0) {
          await assignCityCoords(); // lotes novos de syncs que rodaram no meio
          const left = await Property.countDocuments({ geo: 'city', geoTried: { $ne: true }, address: { $gt: '' } });
          log(`Geo: +${done} endereços processados, ${left} na fila`);
        }
      } catch (err) {
        log(`Geo: erro — ${err instanceof Error ? err.message : err}`);
      }
      await sleep(10 * 60 * 1000);
    }
  };
  loop();
}
