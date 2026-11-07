# Leilões de Imóveis

Agregador open source de lotes de leilão no Brasil. Junta imóveis, veículos,
equipamentos, aeronaves, embarcações e mercadorias de vários bancos e
leiloeiros numa única busca, com filtros, mapa e página de detalhe.

## Origens suportadas

| Origem | Site |
| --- | --- |
| Caixa Econômica Federal | venda-imoveis.caixa.gov.br |
| Bradesco | vitrinebradesco.com.br |
| Santander | santanderimoveis.com.br |
| Banco do Brasil | seuimovelbb.com.br |
| Emgea | emgea.gov.br |
| Banco Inter | inter.superbid.net |
| Banrisul | banrisul.com.br |
| Sicredi | imoveiseveiculos.app.sicredi.com.br |
| Freitas Leiloeiro | freitasleiloeiro.com.br |
| Superbid / Sold | superbid.net |
| Imóveis da União (SPU) | imoveis.economia.gov.br |
| Receita Federal | receita.fazenda.gov.br (SLE) |
| Lance no Leilão | lancenoleilao.com.br |
| Resale | resale.com.br |
| Mega Leilões | megaleiloes.com.br |
| Portal Zuk | portalzuk.com.br |
| VIP Leilões | vipleiloes.com.br |

A lista oficial fica em `ORIGINS` (`server/src/config.ts`), e os tipos de lote
em `KINDS`.

## Stack

- **Backend:** Node, Fastify, Mongoose (MongoDB) e TypeScript
- **Frontend:** React, Vite, TypeScript, TanStack Query, Zustand, Tailwind e shadcn/ui

## Estrutura

```
.
├── docker-compose.yml          # MongoDB
├── server/                     # API Fastify
│   ├── data/municipios.csv     # coordenadas dos municípios (IBGE), usadas no mapa
│   ├── scripts/import.ts       # npm run import -- <origem> [csv]
│   └── src/
│       ├── config.ts           # ORIGINS e KINDS
│       ├── models/             # Property, SyncRun
│       ├── routes/             # properties, sync
│       └── lib/
│           ├── sync.ts         # sync genérico e registro de origens (SOURCES)
│           ├── <origem>.ts     # um arquivo por site (caixa.ts, bradesco.ts...)
│           └── geo.ts, parse.ts, categories.ts
└── web/                        # SPA React
    └── src/
        ├── pages/              # ListPage, DetailPage, SyncPage
        ├── components/         # UI (shadcn), filtros, mapa, cards
        └── store/useFilters.ts # estado dos filtros
```

## Como rodar

Requisitos: Node 20+ e Docker (ou qualquer MongoDB).

```bash
# 1. MongoDB
docker compose up -d                 # sobe em localhost:27017

# 2. Backend
cd server
cp .env.example .env
npm install
npm run import -- bradesco           # importa uma origem (qualquer chave de ORIGINS)
npm run dev                          # API em http://localhost:3333

# 3. Frontend (em outro terminal)
cd web
cp .env.example .env
npm install
npm run dev                          # app em http://localhost:5173
```

Com o servidor rodando, cada origem é sincronizada automaticamente uma vez por
dia. A página **/sync** também permite rodar uma sincronização na hora.

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/properties` | Lista com filtros, ordenação e paginação |
| GET | `/api/properties/map` | Pontos do mapa (`[id, lat, lng, preço, precisão]`) com os mesmos filtros |
| GET | `/api/properties/:id` | Detalhe de um lote |
| GET | `/api/properties/meta/filters?kind=` | Opções de filtro (estados, tipos, modalidades, origens, faixa de preço) |
| GET | `/api/properties/meta/cities?state=RJ` | Cidades, opcionalmente filtradas por estado |
| GET | `/api/sync` | Histórico de sincronizações e links de download |
| POST | `/api/sync/run?origin=bradesco` | Sincroniza uma origem agora (padrão: `caixa`) |
| POST | `/api/sync/upload?file=X.csv` | Importa um CSV da Caixa (corpo `text/csv`) |

**Filtros de `/api/properties`:** `search`, `kind`, `state`, `city`,
`propertyType`, `saleModality`, `origin`, `financing`, `minPrice`, `maxPrice`,
`minDiscount`, `minArea`, `maxArea` e, para veículos, `brand`, `fuel`,
`minYear`, `maxYear` e `maxKm`. Aceitam vários valores separados por vírgula
(ex.: `state=RJ,SP`).

**Ordenação:** `sort` ∈ `price | discount | appraisalValue | area | year | km | createdAt`,
`order` ∈ `asc | desc`. **Paginação:** `page`, `limit` (máx. 100).

### Caixa

O site da Caixa tem anti-bot (Radware) e às vezes bloqueia o download do CSV.
Quando isso acontece, a página **/sync** mostra o erro, os links de download
(geral e por UF) e um campo para enviar os CSVs baixados pelo navegador. Também
dá para importar um arquivo local com `npm run import -- caixa <arquivo.csv>`.
Os imóveis que saem da lista são removidos, mas só nas UFs presentes no arquivo
enviado.

## Adicionando uma nova origem

1. Crie `server/src/lib/<origem>.ts` com uma função `fetch<Origem>()` que
   retorne os lotes já normalizados (`PropertyInput[]`: `externalId`, `state`
   e os demais campos do model `Property`). Use `bradesco.ts` como exemplo.
2. Registre a função em `SOURCES` (`server/src/lib/sync.ts`) e os dados do site
   em `ORIGINS` (`server/src/config.ts`).
3. Pronto. Gravação no banco, remoção dos lotes que saíram, sync diário, botão
   na página /sync e filtro de origem no front já funcionam sem mais nada.

Pull requests com novas origens são bem-vindos.

## Aviso

Projeto independente, sem vínculo com nenhum dos bancos ou leiloeiros listados.
Os dados vêm de páginas e APIs públicas desses sites e podem estar
desatualizados. Confirme sempre as condições do leilão na fonte original antes
de dar um lance.

## Licença

[MIT](LICENSE)
