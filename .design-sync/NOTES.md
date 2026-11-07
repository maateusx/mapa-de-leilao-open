# Notas de sync — Leilões Imóveis DS

## Contexto do repositório
- O pacote sincronizado é `web/` (app Vite), **não** uma biblioteca empacotada.
  Não há `dist/` de componentes → o conversor roda em **modo synth-entry**
  (sintetiza um entry a partir de `src/components`).
- Para o conversor enxergar o pacote, existe um **self-symlink**
  `web/node_modules/leiloes-web → ..` (recriar por clone:
  `ln -sfn .. web/node_modules/leiloes-web`). É o que faz `--node-modules
  ./web/node_modules` resolver `PKG_DIR` para `web/`.
- `srcDir` é `src/components` (não `src`) **de propósito**: em synth-entry o
  entry faz `export *` de TODO `.tsx` do srcDir. Apontar para `src` puxaria
  `main.tsx` → `index.css` → `@import "tailwindcss"` (esbuild não resolve) e
  quebra o build. `src/components` isola os 16 componentes; imports para
  `@/lib`, `@/store` continuam resolvendo via tsconfig paths.

## CSS / Tailwind v4
- As classes utilitárias só existem após compilar o Tailwind. `cssEntry` aponta
  para `web/dist/ds-compiled.css`, gerado de forma **determinística** por
  `buildCmd` (`npx @tailwindcss/cli@4 -i src/index.css -o dist/ds-compiled.css`).
  Sempre rode o buildCmd antes do conversor num re-sync.

## Contratos (.d.ts)
- Em synth-entry a extração de props volta vazia (`[key: string]: unknown`).
  Por isso há `dtsPropsFor` para os 16 componentes — escritos à mão a partir do
  source. Ao mudar a API de um componente, **atualize o `dtsPropsFor`
  correspondente** (não é auto-extraído).

## Agrupamento
- O grupo vem do frontmatter `category` das docs em `web/docs/components/`, mas é
  **slugificado** (lowercase, acento→traço). Por isso usei `Dominio` (sem
  acento) — `Domínio` viraria `dom-nio`. Grupos atuais: `primitivos`, `dominio`.

## Render / verificação
- Sync feito com `--no-render-check` (sem playwright/chromium nesta máquina).
  **Os previews NÃO foram verificados por máquina** e todos os 16 saíram como
  **floor card** (não autorados). Sanidade visual manual foi feita com o Google
  Chrome headless montando os primitivos a partir de `window.LeiloesDS` — OK.

## Known render warns
- `[RENDER_SKIPPED]` no validate é esperado (escolha de pular o render check),
  não é um warn novo.

## Re-sync risks (ler antes do próximo sync)
- **Previews floor-card**: autoráveis incrementalmente quando houver
  playwright+chromium. Componentes de domínio precisam de providers para o
  preview: `PropertyCard`/`Header` → Router; `FiltersPanel`/`Toolbar` → store
  Zustand (ok sem provider) e `FiltersPanel` → `QueryClientProvider` + API. Use
  `cfg.provider` (Router/QueryClient via `extraEntries`) ao autorar.
- **cssEntry com nome estável**: depende de rodar o buildCmd; se pular, o CSS
  pode ficar defasado em relação ao source.
- **dtsPropsFor manual**: pode divergir do source se a API mudar sem atualizar o
  config.
- **Não é repositório git**: os arquivos duráveis em `.design-sync/` (config.json,
  conventions.md, NOTES.md, docs em `web/docs/components/`) não estão versionados.
