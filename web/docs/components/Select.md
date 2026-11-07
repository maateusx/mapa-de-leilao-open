---
category: Primitivos
---

# Select

Seletor dropdown (radix). Compõe com `SelectTrigger`, `SelectValue`, `SelectContent` e `SelectItem` (todos exportados). Item não pode ter `value=""`.

```tsx
<Select value={v} onValueChange={setV}>
  <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
  <SelectContent><SelectItem value="RJ">RJ</SelectItem></SelectContent>
</Select>
```
