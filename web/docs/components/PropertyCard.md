---
category: Dominio
---

# PropertyCard

Card de um imóvel de leilão. Renderiza thumb com gradiente por tipo, badges de desconto/tipo, endereço, localização, specs (área, quartos, vagas), preço e modalidade. Layout muda via `view`: `grid` (vertical) ou `list` (horizontal). Liga para a página de detalhe via react-router (`/imovel/:id`), então precisa de um Router no contexto.

```tsx
<PropertyCard property={property} view="grid" />
```
