import type { FastifyInstance } from 'fastify';
import { isValidObjectId } from 'mongoose';
import { Property } from '../models/Property.js';
import { KINDS, ORIGINS } from '../config.js';
import { expandCategories, groupCategories } from '../lib/categories.js';

// ponytail: cache de 5 min das categorias cruas; novas variantes de um sync aparecem com atraso.
let rawTypes: { at: number; list: Promise<string[]> } | undefined;
function allRawTypes() {
  if (!rawTypes || Date.now() - rawTypes.at > 5 * 60_000) {
    rawTypes = { at: Date.now(), list: Property.distinct('propertyType').exec() as Promise<string[]> };
  }
  return rawTypes.list;
}

type ListQuery = {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
  search?: string;
  state?: string;
  city?: string;
  propertyType?: string;
  saleModality?: string;
  origin?: string;
  kind?: string;
  brand?: string;
  fuel?: string;
  minYear?: string;
  maxYear?: string;
  maxKm?: string;
  financing?: string;
  minPrice?: string;
  maxPrice?: string;
  minDiscount?: string;
  minArea?: string;
  maxArea?: string;
  bbox?: string; // oeste,sul,leste,norte (área visível do mapa)
};

const SORT_FIELDS: Record<string, string> = {
  price: 'price',
  discount: 'discount',
  appraisalValue: 'appraisalValue',
  area: 'privateArea',
  year: 'year',
  km: 'km',
  createdAt: 'createdAt',
};

/** Aceita "RJ" ou "RJ|SP|MG" (| porque há valores com vírgula) e devolve $in quando há vários. */
function multi(value?: string) {
  if (!value) return undefined;
  const parts = value.split('|').map((v) => v.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : { $in: parts };
}

async function buildFilter(q: ListQuery) {
  const filter: Record<string, unknown> = {};

  const state = multi(q.state);
  if (state) filter.state = state;
  const city = multi(q.city);
  if (city) filter.city = city;
  // Categoria chega como rótulo do grupo; expande para todas as grafias no banco.
  if (q.propertyType) {
    filter.propertyType = { $in: expandCategories(q.propertyType.split('|'), await allRawTypes()) };
  }
  const saleModality = multi(q.saleModality);
  if (saleModality) filter.saleModality = saleModality;
  const origin = multi(q.origin);
  if (origin) filter.origin = origin;
  const kind = multi(q.kind);
  if (kind) filter.kind = kind;
  const brand = multi(q.brand);
  if (brand) filter.brand = brand;
  const fuel = multi(q.fuel);
  if (fuel) filter.fuel = fuel;

  const year: Record<string, number> = {};
  if (q.minYear) year.$gte = Number(q.minYear);
  if (q.maxYear) year.$lte = Number(q.maxYear);
  if (Object.keys(year).length) filter.year = year;
  if (q.maxKm) filter.km = { $lte: Number(q.maxKm) };

  if (q.financing === 'true') filter.financing = true;
  if (q.financing === 'false') filter.financing = false;

  const price: Record<string, number> = {};
  if (q.minPrice) price.$gte = Number(q.minPrice);
  if (q.maxPrice) price.$lte = Number(q.maxPrice);
  if (Object.keys(price).length) filter.price = price;

  if (q.minDiscount) filter.discount = { $gte: Number(q.minDiscount) };

  const area: Record<string, number> = {};
  if (q.minArea) area.$gte = Number(q.minArea);
  if (q.maxArea) area.$lte = Number(q.maxArea);
  if (Object.keys(area).length) filter.privateArea = area;

  const box = q.bbox?.split(',').map(Number);
  if (box?.length === 4 && box.every(Number.isFinite)) {
    const [w, s, e, n] = box;
    filter.lat = { $gte: s, $lte: n };
    filter.lng = { $gte: w, $lte: e };
  }

  if (q.search?.trim()) {
    const rx = new RegExp(q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { brand: rx }, { model: rx }, { city: rx }, { address: rx }, { neighborhood: rx }, { description: rx }];
  }

  return filter;
}

export async function propertyRoutes(app: FastifyInstance) {
  // Lista paginada com filtros e ordenação.
  app.get<{ Querystring: ListQuery }>('/api/properties', async (req) => {
    const q = req.query;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 24));
    const sortField = SORT_FIELDS[q.sort ?? 'createdAt'] ?? 'createdAt';
    const order = q.order === 'asc' ? 1 : -1;

    const filter = await buildFilter(q);

    const [items, total] = await Promise.all([
      Property.find(filter)
        .sort({ [sortField]: order, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Property.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  });

  // Pontos do mapa: todos os lotes filtrados com coordenada, em formato compacto
  // [id, lat, lng, preço, precisão]. O card abre via /api/properties/:id.
  // ponytail: devolve tudo (~45k pontos, ~2 MB); recortar por bbox/zoom se pesar.
  app.get<{ Querystring: ListQuery }>('/api/properties/map', async (req) => {
    const filter = { ...(await buildFilter({ ...req.query, bbox: undefined })), lat: { $ne: null } };
    const docs = await Property.find(filter, { lat: 1, lng: 1, price: 1, geo: 1 }).lean();
    return docs.map((d) => [String(d._id), d.lat, d.lng, d.price, d.geo === 'address' ? 1 : 0]);
  });

  // Opções para montar os filtros do frontend.
  // `kind` restringe as categorias (Casa, Carro...) ao tipo de lote escolhido.
  app.get<{ Querystring: { kind?: string } }>('/api/properties/meta/filters', async (req) => {
    const byKind = req.query.kind ? { kind: multi(req.query.kind) } : {};
    const [brands, fuels] = await Promise.all([
      Property.distinct('brand', byKind),
      Property.distinct('fuel', byKind),
    ]);
    const [kinds, states, propertyTypes, saleModalities, origins, priceRange] = await Promise.all([
      Property.distinct('kind'),
      Property.distinct('state'),
      Property.aggregate<{ _id: string; n: number }>([
        { $match: byKind },
        { $group: { _id: '$propertyType', n: { $sum: 1 } } },
      ]),
      Property.distinct('saleModality'),
      Property.distinct('origin'),
      Property.aggregate([
        { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
      ]),
    ]);

    return {
      kinds: Object.keys(KINDS)
        .filter((key) => (kinds as string[]).includes(key))
        .map((key) => ({ key, name: KINDS[key] })),
      states: (states as string[]).filter(Boolean).sort(),
      brands: (brands as string[]).filter(Boolean).sort(),
      fuels: (fuels as string[]).filter(Boolean).sort(),
      propertyTypes: groupCategories(propertyTypes),
      saleModalities: (saleModalities as string[]).filter(Boolean).sort(),
      origins: (origins as string[]).filter(Boolean).map((key) => ({
        key,
        name: ORIGINS[key]?.name ?? key,
      })),
      priceRange: priceRange[0] ? { min: priceRange[0].min, max: priceRange[0].max } : { min: 0, max: 0 },
    };
  });

  // Cidades disponíveis (opcionalmente filtradas por estado).
  app.get<{ Querystring: { state?: string } }>('/api/properties/meta/cities', async (req) => {
    const filter = req.query.state ? { state: multi(req.query.state) } : {};
    const cities = await Property.distinct('city', filter);
    return { cities: (cities as string[]).filter(Boolean).sort() };
  });

  // Detalhe de um imóvel.
  app.get<{ Params: { id: string } }>('/api/properties/:id', async (req, reply) => {
    if (!isValidObjectId(req.params.id)) {
      return reply.code(400).send({ error: 'id inválido' });
    }
    const property = await Property.findById(req.params.id).lean();
    if (!property) return reply.code(404).send({ error: 'imóvel não encontrado' });
    return property;
  });
}
