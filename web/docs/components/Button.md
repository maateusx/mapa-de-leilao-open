---
category: Primitivos
---

# Button

Botão de ação primário do design system. Variantes de cor via `variant` e tamanhos via `size`. Use `asChild` para renderizar como outro elemento (ex.: um link) mantendo o estilo.

```tsx
<Button variant="default" size="lg">Ver no leilão</Button>
<Button variant="outline" size="icon"><Icon /></Button>
<Button asChild><a href="...">Link estilizado</a></Button>
```
