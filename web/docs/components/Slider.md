---
category: Primitivos
---

# Slider

Controle de faixa (radix). Suporta múltiplos thumbs passando um array em `value` — usado para faixa de preço (min/max).

```tsx
<Slider min={0} max={1000000} step={5000} value={[min, max]} onValueChange={([a,b]) => set(a,b)} />
```
