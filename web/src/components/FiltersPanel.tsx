import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { useFilters } from '@/store/useFilters';
import { formatCurrency } from '@/lib/format';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox, MULTI_SEP } from '@/components/ui/combobox';

/** Multiselect com autocomplete; "todos" = string vazia, vários = unidos por MULTI_SEP. */
function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Combobox
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        searchPlaceholder="Buscar..."
        multiple
        options={[{ value: '', label: placeholder }, ...options]}
      />
    </div>
  );
}

const YEARS = Array.from({ length: 16 }, (_, i) => new Date().getFullYear() - i);

/** Select numérico com "Qualquer" = undefined. */
function NumberSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value?: number;
  onChange: (v?: number) => void;
  options: { value: number; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={String(value ?? 0)} onValueChange={(v) => onChange(Number(v) || undefined)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0">Qualquer</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={String(o.value)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function FiltersPanel() {
  const f = useFilters();
  const { data: opts } = useQuery({
    queryKey: ['filter-options', f.kind],
    queryFn: () => api.getFilterOptions(f.kind || undefined),
    placeholderData: (prev) => prev,
    staleTime: Infinity,
  });
  const { data: cityData } = useQuery({
    queryKey: ['cities', f.state],
    queryFn: () => api.getCities(f.state || undefined),
    enabled: !!opts,
  });

  const priceMin = opts?.priceRange.min ?? 0;
  const priceMax = opts?.priceRange.max ?? 1_000_000;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Filtros</h2>
        <Button variant="ghost" size="sm" onClick={f.reset} className="text-muted-foreground">
          <RotateCcw className="h-3.5 w-3.5" /> Limpar
        </Button>
      </div>

      <FilterSelect
        label="Tipo de lote"
        placeholder="Todos os tipos"
        value={f.kind}
        onChange={(v) => f.set({ kind: v, propertyType: '', brand: '', fuel: '', minYear: undefined, maxKm: undefined })}
        options={(opts?.kinds ?? []).map((k) => ({ value: k.key, label: k.name }))}
      />

      <FilterSelect
        label="Origem"
        placeholder="Todas as origens"
        value={f.origin}
        onChange={(v) => f.set({ origin: v })}
        options={(opts?.origins ?? []).map((o) => ({ value: o.key, label: o.name }))}
      />

      <FilterSelect
        label="Estado (UF)"
        placeholder="Todos os estados"
        value={f.state}
        onChange={(v) => f.set({ state: v, city: '' })}
        options={(opts?.states ?? []).map((s) => ({ value: s, label: s }))}
      />

      <FilterSelect
        label="Cidade"
        placeholder="Todas as cidades"
        value={f.city}
        onChange={(v) => f.set({ city: v })}
        options={(cityData?.cities ?? []).map((c) => ({ value: c, label: c }))}
      />

      <FilterSelect
        label="Categoria"
        placeholder="Todas as categorias"
        value={f.propertyType}
        onChange={(v) => f.set({ propertyType: v })}
        options={(opts?.propertyTypes ?? []).map((t) => ({ value: t, label: t }))}
      />

      {f.kind && f.kind.split(MULTI_SEP).some((k) => k !== 'realstate') && (opts?.brands.length ?? 0) > 0 && (
        <>
          <FilterSelect
            label="Marca"
            placeholder="Todas as marcas"
            value={f.brand}
            onChange={(v) => f.set({ brand: v })}
            options={(opts?.brands ?? []).map((b) => ({ value: b, label: b }))}
          />
          <FilterSelect
            label="Combustível"
            placeholder="Todos"
            value={f.fuel}
            onChange={(v) => f.set({ fuel: v })}
            options={(opts?.fuels ?? []).map((b) => ({ value: b, label: b }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberSelect
              label="Ano mínimo"
              value={f.minYear}
              onChange={(v) => f.set({ minYear: v })}
              options={YEARS.map((y) => ({ value: y, label: `${y} ou mais novo` }))}
            />
            <NumberSelect
              label="Km máximo"
              value={f.maxKm}
              onChange={(v) => f.set({ maxKm: v })}
              options={[20_000, 50_000, 80_000, 120_000, 200_000].map((k) => ({
                value: k,
                label: `Até ${k.toLocaleString('pt-BR')} km`,
              }))}
            />
          </div>
        </>
      )}

      <FilterSelect
        label="Modalidade (tipo do leilão)"
        placeholder="Todas as modalidades"
        value={f.saleModality}
        onChange={(v) => f.set({ saleModality: v })}
        options={(opts?.saleModalities ?? []).map((m) => ({ value: m, label: m }))}
      />

      <Separator />

      <div className="space-y-3">
        <Label>Faixa de preço</Label>
        <Slider
          min={priceMin}
          max={priceMax}
          step={5000}
          value={[f.minPrice ?? priceMin, f.maxPrice ?? priceMax]}
          onValueChange={([min, max]) =>
            f.set({
              minPrice: min <= priceMin ? undefined : min,
              maxPrice: max >= priceMax ? undefined : max,
            })
          }
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatCurrency(f.minPrice ?? priceMin)}</span>
          <span>{formatCurrency(f.maxPrice ?? priceMax)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Desconto mínimo</Label>
        <Select
          value={String(f.minDiscount ?? 0)}
          onValueChange={(v) => f.set({ minDiscount: Number(v) || undefined })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0, 10, 20, 30, 40, 50, 60].map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d === 0 ? 'Qualquer desconto' : `A partir de ${d}%`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox
          checked={f.financing === 'true'}
          onCheckedChange={(c) => f.set({ financing: c ? 'true' : 'all' })}
        />
        <span className="text-sm">Aceita financiamento</span>
      </label>
    </div>
  );
}
