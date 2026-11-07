import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SearchX, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useFilters, filtersToParams } from '@/store/useFilters';
import { FiltersPanel } from '@/components/FiltersPanel';
import { Toolbar } from '@/components/Toolbar';
import { PropertyCard } from '@/components/PropertyCard';
import { Pagination } from '@/components/Pagination';
import { MapView } from '@/components/MapView';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NO_POINTS: [string, number, number, number, 0 | 1][] = [];

export function ListPage() {
  const f = useFilters();
  const params = filtersToParams(f);
  const isMap = f.view === 'map';
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['properties', params],
    queryFn: () => api.listProperties(params),
    placeholderData: keepPreviousData,
    enabled: !isMap || !!f.bbox, // no mapa, espera a área visível
  });

  // Pontos do mapa: mesmos filtros, sem paginação nem recorte de área.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { page, limit, sort, order, bbox, ...mapParams } = params;
  const points = useQuery({
    queryKey: ['map', mapParams],
    queryFn: () => api.getMapPoints(mapParams),
    enabled: isMap,
    staleTime: 5 * 60 * 1000,
  });
  const selected = useQuery({
    queryKey: ['property', selectedId],
    queryFn: () => api.getProperty(selectedId!),
    enabled: !!selectedId,
  });

  // Volta ao topo ao trocar de página.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('map-list')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [f.page]);

  const view = f.view === 'list' ? 'list' : 'grid';
  const gridClass = isMap
    ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3'
    : view === 'grid'
      ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'
      : 'flex flex-col gap-3';

  const results = (
    <>
      <Toolbar total={data?.total ?? 0} />

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center text-destructive">
          Erro ao carregar lotes. Verifique se a API está rodando em <code>localhost:3333</code>.
        </div>
      )}

      {isLoading || (isMap && !data) ? (
        <div className={gridClass}>
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className={cn(view === 'grid' ? 'h-72' : 'h-32')} />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className={gridClass}>
            {data.items.map((p) => (
              <div
                key={p._id}
                onMouseEnter={() => setHoveredId(p._id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <PropertyCard property={p} view={view} />
              </div>
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={(page) => f.set({ page })} />
        </>
      ) : (
        !isError && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-20 text-center">
            <SearchX className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              {isMap ? 'Nenhum lote nesta área do mapa.' : 'Nenhum lote encontrado com esses filtros.'}
            </p>
            <Button variant="outline" onClick={f.reset}>
              Limpar filtros
            </Button>
          </div>
        )
      )}
    </>
  );

  if (isMap) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col md:flex-row">
        <div id="map-list" className="min-w-0 flex-1 space-y-5 overflow-y-auto px-4 py-6 md:max-w-[58%]">
          {results}
        </div>
        <div className="relative order-first h-[45vh] shrink-0 md:order-none md:h-auto md:flex-1">
          <MapView
            points={points.data ?? NO_POINTS}
            activeId={hoveredId ?? selectedId}
            onSelect={setSelectedId}
            onBoundsChange={(bbox) => f.set({ bbox })}
          />
          {points.isFetching && (
            <div className="absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-full bg-background px-3 py-1 text-xs shadow">
              Carregando mapa…
            </div>
          )}
          {selectedId && selected.data && (
            <div className="absolute bottom-4 left-1/2 z-[1000] w-72 -translate-x-1/2 shadow-xl">
              <button
                onClick={() => setSelectedId(null)}
                className="absolute -right-2 -top-2 z-10 rounded-full border bg-background p-1 shadow"
                aria-label="Fechar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <PropertyCard property={selected.data} view="grid" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
      {/* Sidebar de filtros (desktop) */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border bg-card p-4">
          <FiltersPanel />
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-5">{results}</div>
    </div>
  );
}
