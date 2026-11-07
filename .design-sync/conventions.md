# Leilões Imóveis — design system

React + Tailwind CSS v4 + Radix UI (padrão shadcn/ui). Componentes em
`window.LeiloesDS.*`. Português (pt-BR) e formatação de moeda em BRL.

## Setup e wrapping

- **Primitivos** (`Button`, `Card`, `Input`, `Label`, `Badge`, `Select`,
  `Slider`, `Checkbox`, `Separator`, `Skeleton`, `Sheet`) renderizam sozinhos —
  sem provider. `Select`, `Card`, `Sheet` são compostos: use os subcomponentes
  exportados (`SelectTrigger/SelectContent/SelectItem`, `CardHeader/CardContent`,
  `SheetTrigger/SheetContent/SheetTitle`).
- **Domínio**: `PropertyCard` e `Header` usam `react-router` (`Link`) → envolva
  a árvore num Router (`<BrowserRouter>`/`<MemoryRouter>`). `Toolbar` e
  `FiltersPanel` leem o estado de filtros do store Zustand `useFilters`;
  `FiltersPanel` ainda busca opções via TanStack Query → precisa de
  `<QueryClientProvider>` e da API rodando. Para telas novas, prefira compor a
  partir dos primitivos e do `PropertyCard` (recebe `property` por prop).
- Regra de ouro do tema: as cores vivem em variáveis CSS no `styles.css`
  (`@theme`). Qualquer árvore renderizada deve ter `styles.css` no escopo, senão
  os utilitários de cor não resolvem.

## Idioma de estilo: classes utilitárias Tailwind sobre tokens

Estilize com classes utilitárias do Tailwind; as cores referenciam os tokens do
DS, nunca cores cruas. Vocabulário real (definido em `styles.css`):

| Papel | Classes |
|---|---|
| Fundo/texto base | `bg-background` `text-foreground` |
| Primária (verde da marca) | `bg-primary` `text-primary-foreground` |
| Secundária | `bg-secondary` `text-secondary-foreground` |
| Suave/apoio | `bg-muted` `text-muted-foreground` |
| Cartão | `bg-card` `text-card-foreground` |
| Destrutiva | `bg-destructive` `text-destructive-foreground` |
| Borda | `border` `border-input` |
| Raio | `rounded-md` `rounded-lg` (via `--radius`) |

`Badge` tem a variante extra `success` (verde esmeralda) usada para destacar
desconto. A cor primária da marca é um verde (oklch ~152° de matiz).

## Onde está a verdade

- `styles.css` — importa `_ds_bundle.css` (estilos dos componentes) e os tokens
  Tailwind compilados; leia-o antes de estilizar.
- `components/<grupo>/<Nome>/<Nome>.prompt.md` — uso e exemplos por componente;
  `<Nome>.d.ts` — contrato de props.

## Exemplo idiomático

```tsx
import { Card, CardContent, Button, Badge } from 'window.LeiloesDS';

<Card className="max-w-sm">
  <CardContent className="space-y-3 p-4">
    <Badge variant="success">90% OFF</Badge>
    <p className="text-lg font-bold text-foreground">R$ 115.625</p>
    <Button className="w-full">Ver no leilão</Button>
  </CardContent>
</Card>
```
