import { LayoutGrid, List, Map as MapIcon, Search, SlidersHorizontal } from 'lucide-react';
import { useFilters } from '@/store/useFilters';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { FiltersPanel } from './FiltersPanel';

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'discount:desc', label: 'Maior desconto' },
  { value: 'price:asc', label: 'Menor preço' },
  { value: 'price:desc', label: 'Maior preço' },
  { value: 'area:desc', label: 'Maior área' },
  { value: 'year:desc', label: 'Mais novos (ano)' },
  { value: 'km:asc', label: 'Menor km' },
  { value: 'appraisalValue:desc', label: 'Maior avaliação' },
  { value: 'createdAt:desc', label: 'Mais recentes' },
];

export function Toolbar({ total }: { total: number }) {
  const f = useFilters();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Filtros no mobile */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" className={f.view === 'map' ? '' : 'lg:hidden'}>
            <SlidersHorizontal className="h-4 w-4" /> Filtros
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetTitle>Filtros</SheetTitle>
          <FiltersPanel />
        </SheetContent>
      </Sheet>

      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, marca, endereço, cidade..."
          className="pl-9"
          value={f.search}
          onChange={(e) => f.set({ search: e.target.value })}
        />
      </div>

      <p className="hidden whitespace-nowrap text-sm text-muted-foreground sm:block">
        {total.toLocaleString('pt-BR')} lotes
      </p>

      <Select
        value={`${f.sort}:${f.order}`}
        onValueChange={(v) => {
          const [sort, order] = v.split(':');
          f.set({ sort, order: order as 'asc' | 'desc' });
        }}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex rounded-md border">
        <Button
          variant={f.view === 'grid' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => f.setView('grid')}
          aria-label="Visão em grade"
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
        <Button
          variant={f.view === 'list' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => f.setView('list')}
          aria-label="Visão em lista"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant={f.view === 'map' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => f.setView('map')}
          aria-label="Visão em mapa"
        >
          <MapIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
