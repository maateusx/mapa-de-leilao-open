import { Schema, model, InferSchemaType } from 'mongoose';

const propertySchema = new Schema(
  {
    // Origem do leilão (ex.: "caixa"). Permite agregar múltiplos sites.
    origin: { type: String, required: true, index: true },

    // Tipo de lote (chaves em config.ts → KINDS): realstate, vehicles, equipments...
    kind: { type: String, default: 'realstate', index: true },

    // Identificador do imóvel no site de origem.
    externalId: { type: String, required: true },

    state: { type: String, required: true, index: true }, // UF
    city: { type: String, required: true, index: true },
    neighborhood: { type: String, default: '' },
    address: { type: String, default: '' },

    price: { type: Number, required: true, index: true }, // valor de venda atual
    appraisalValue: { type: Number, default: null }, // valor de avaliação
    discount: { type: Number, default: 0, index: true }, // % de desconto
    financing: { type: Boolean, default: false }, // aceita financiamento

    title: { type: String, default: '' }, // nome do lote (ex.: "TOYOTA - HILUX CD - 2017/2018")
    images: { type: [String], default: [] },

    propertyType: { type: String, default: 'Outros', index: true }, // categoria: Casa, Carro, Barco...
    saleModality: { type: String, default: '', index: true }, // tipo do leilão

    description: { type: String, default: '' },
    totalArea: { type: Number, default: null },
    privateArea: { type: Number, default: null },
    landArea: { type: Number, default: null },
    bedrooms: { type: Number, default: null },
    parkingSpaces: { type: Number, default: null },

    link: { type: String, default: '' }, // link para o leilão na origem

    // Veículos, aeronaves, embarcações, equipamentos (extraídos do título/descrição).
    brand: { type: String, default: null, index: true },
    model: { type: String, default: null },
    year: { type: Number, default: null, index: true }, // ano do modelo
    manufactureYear: { type: Number, default: null },
    km: { type: Number, default: null },
    fuel: { type: String, default: null, index: true }, // Flex, Gasolina, Diesel...
    color: { type: String, default: null },
    damage: { type: String, default: null }, // "Pequena Monta", "Média Monta", "Grande Monta"

    // Coordenadas para o mapa (preenchidas por lib/geo.ts, não pelo sync).
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    geo: { type: String, default: null }, // 'city' (centro do município) | 'address' (Nominatim)
    geoTried: { type: Boolean, default: false }, // endereço já passou pelo Nominatim
  },
  { timestamps: true }
);

// Import idempotente: um imóvel é único por (origem, id externo).
propertySchema.index({ origin: 1, externalId: 1 }, { unique: true });
// Filtros combinados mais comuns.
propertySchema.index({ state: 1, city: 1, price: 1 });
// Mapa: recorte por área visível.
propertySchema.index({ lat: 1, lng: 1 });
// Busca textual livre.
propertySchema.index({ city: 'text', address: 'text', description: 'text' });

export type PropertyDoc = InferSchemaType<typeof propertySchema>;
export const Property = model('Property', propertySchema);
