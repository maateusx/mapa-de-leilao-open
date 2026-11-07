export const config = {
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/leiloes',
  port: Number(process.env.PORT ?? 3333),
  host: process.env.HOST ?? '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN ?? true,
};

/** Tipos de lote. As chaves seguem as da API do Bradesco. */
export const KINDS: Record<string, string> = {
  realstate: 'Imóveis',
  vehicles: 'Veículos',
  equipments: 'Equipamentos',
  aircraft: 'Aeronaves',
  boat: 'Embarcações',
  goods: 'Mercadorias', // lotes da Receita: eletrônicos, roupas, bazar...
};

/**
 * Origens de leilão suportadas. Para adicionar um novo site, registre a chave
 * aqui e o fetch correspondente em src/lib/sync.ts (SOURCES).
 */
export const ORIGINS: Record<string, { key: string; name: string; website: string }> = {
  caixa: {
    key: 'caixa',
    name: 'Caixa Econômica Federal',
    website: 'https://venda-imoveis.caixa.gov.br',
  },
  bradesco: {
    key: 'bradesco',
    name: 'Bradesco',
    website: 'https://vitrinebradesco.com.br',
  },
  santander: {
    key: 'santander',
    name: 'Santander',
    website: 'https://www.santanderimoveis.com.br',
  },
  bb: {
    key: 'bb',
    name: 'Banco do Brasil',
    website: 'https://www.seuimovelbb.com.br',
  },
  emgea: {
    key: 'emgea',
    name: 'Emgea',
    website: 'https://emgea.gov.br',
  },
  inter: {
    key: 'inter',
    name: 'Banco Inter',
    website: 'https://inter.superbid.net',
  },
  banrisul: {
    key: 'banrisul',
    name: 'Banrisul',
    website: 'https://www.banrisul.com.br',
  },
  sicredi: {
    key: 'sicredi',
    name: 'Sicredi',
    website: 'https://imoveiseveiculos.app.sicredi.com.br',
  },
  freitas: {
    key: 'freitas',
    name: 'Freitas Leiloeiro',
    website: 'https://www.freitasleiloeiro.com.br',
  },
  superbid: {
    key: 'superbid',
    name: 'Superbid / Sold',
    website: 'https://www.superbid.net',
  },
  spu: {
    key: 'spu',
    name: 'Imóveis da União (SPU)',
    website: 'https://imoveis.economia.gov.br',
  },
  receita: {
    key: 'receita',
    name: 'Receita Federal',
    website: 'https://www25.receita.fazenda.gov.br/sle-sociedade/portal',
  },
  lancenoleilao: {
    key: 'lancenoleilao',
    name: 'Lance no Leilão',
    website: 'https://www.lancenoleilao.com.br',
  },
  resale: {
    key: 'resale',
    name: 'Resale',
    website: 'https://www.resale.com.br',
  },
  mega: {
    key: 'mega',
    name: 'Mega Leilões',
    website: 'https://www.megaleiloes.com.br',
  },
  zuk: {
    key: 'zuk',
    name: 'Portal Zuk',
    website: 'https://www.portalzuk.com.br',
  },
  vip: {
    key: 'vip',
    name: 'VIP Leilões',
    website: 'https://www.vipleiloes.com.br',
  },
};
