// Self-check do mapeamento do Bradesco: npx tsx scripts/bradesco.check.ts
import assert from 'node:assert/strict';
import { parseVehicle, toProperty, toUf } from '../src/lib/bradesco.js';

const base = {
  guid: 'g1', slug: 'casa-x', type: 'realstate', images: null, city: 'Gurupi', state: 'TO', neighborhood: 'Waldir Lins I',
  category: 'Casa', realstate_auction_type: 'alienacao-fiduciaria',
  final_auction_value: null, min_auction_value_2: null,
};
const a = toProperty({
  ...base, name: 'Casa - Gurupi/TO - Rua G, 250, Waldir Lins I', price: 155400, min_auction_value_1: 358042,
  description: 'CASA. Áreas totais: terr. 300,00m² e constr. 93,28m² (lançado consta 105,99m²).',
});
assert.equal(a.address, 'Rua G, 250, Waldir Lins I');
assert.equal(a.landArea, 300);
assert.equal(a.totalArea, 93.28);
assert.equal(a.discount, 56.6);
assert.equal(a.link, 'https://vitrinebradesco.com.br/auctions/casa-x');
assert.equal(a.saleModality, 'Leilão - Alienação Fiduciária');

const b = toProperty({
  ...base, name: 'Casa - X/SP - Rua Y', price: 705001, min_auction_value_1: 705001,
  description: 'Área Construída: 77,22m² Área de Terreno: 157,1775m². Área Privativa: 1.033,00m².',
});
assert.equal(b.totalArea, 77.22);
assert.equal(b.landArea, 157.1775);
assert.equal(b.privateArea, 1033);
assert.equal(b.discount, 0);
// price 0 (como a API manda): cai para final_auction_value.
const c = toProperty({ ...base, name: 'Casa - X/SP - Rua Y', price: 0, final_auction_value: 875295, min_auction_value_1: 875295, description: '' });
assert.equal(c.price, 875295);
// Veículo: estado por extenso, sem endereço, título = nome.
const v = toProperty({
  ...base, type: 'vehicles', category: 'Carro', state: 'Ceará', realstate_auction_type: null,
  images: ['https://img/1'], name: 'TOYOTA - HILUX CD - 2017  /  2018', price: 65500, min_auction_value_1: null,
  description: 'TOYOTA HILUX CD, 2017/2018, Preta, Diesel',
});
assert.equal(v.state, 'CE');
assert.equal(v.kind, 'vehicles');
assert.equal(v.address, '');
assert.equal(v.title, 'TOYOTA - HILUX CD - 2017  /  2018');
assert.deepEqual(v.images, ['https://img/1']);
assert.equal(v.brand, 'Toyota');
assert.equal(v.model, 'HILUX CD');
assert.equal(v.year, 2018);
assert.equal(v.manufactureYear, 2017);
assert.equal(v.fuel, 'Diesel');
assert.equal(v.color, 'Preta');

// Formatos dos outros leiloeiros.
assert.deepEqual(
  parseVehicle('TOYOTA - RAV4 - 2020  /  2020', 'TOYOTA RAV4, 2020/2020, Branca, HIBRIDO ELETRICO/GASOLINA, Km 101084, Média Monta'),
  { brand: 'Toyota', model: 'RAV4', manufactureYear: 2020, year: 2020, km: 101084, fuel: 'Híbrido', color: 'Branca', damage: 'Média Monta' }
);
const fr = parseVehicle('Volvo - Xc60 T8 Momentum - 2021  /  2021', 'Volvo, Xc60 T8 Momentum, 2021, 2021, Preta, Flex, 103066');
assert.equal(fr.km, 103066);
assert.equal(fr.fuel, 'Flex');
const vip = parseVehicle('MERCEDES-BENZ - Atego - 2024  /  2025', 'MERCEDES-BENZ Atego, 2024/2025, Cinza, Diesel, Km , Média Monta');
assert.equal(vip.brand, 'Mercedes-Benz');
assert.equal(vip.km, null);
assert.equal(parseVehicle('X - Y - 2014  /  2014', 'Gm, Prisma, 2014, 2014, Gas/Alc, 173292').fuel, 'Flex');
assert.equal(parseVehicle('Outros', 'Trator John Deere 5080E Cabinado, Ano Fabricação 2022').year, 2022);

const lr = parseVehicle('LAND ROVER - R.R SPT - 2013  /  2014', 'LAND ROVER R.R SPT 3.0 TD SE - 2013/2014 - Verde - Exposto em: RODOVIA BR 470 KM 17, Bairro: PRETO');
assert.equal(lr.km, null);
assert.equal(lr.color, 'Verde');

assert.equal(parseVehicle('Gm - S10 - 2016  /  2016', '').brand, 'Chevrolet');
assert.equal(parseVehicle('-- - X - 2016  /  2016', '').brand, null);

assert.equal(toUf('são paulo'), 'SP');
assert.equal(toUf('Rio Grande do Sul'), 'RS');
assert.equal(toUf('xx'), '');
console.log('ok');
