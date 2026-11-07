import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { formatCurrencyShort } from '@/lib/format';

type Point = [id: string, lat: number, lng: number, price: number, exact: 0 | 1];

const BRAZIL = L.latLngBounds([-33.75, -73.99], [5.27, -34.79]);

const pin = (price: number, exact: 0 | 1) =>
  L.divIcon({
    className: '',
    html: `<div class="price-pin${exact ? '' : ' approx'}">${formatCurrencyShort(price)}</div>`,
    iconSize: [80, 26],
    iconAnchor: [40, 13],
  });

/**
 * Mapa estilo Airbnb: preço em cada marcador, agrupamento por proximidade.
 * Marcador tracejado = lote no centro da cidade (sem endereço geocodificado).
 */
export function MapView({
  points,
  activeId,
  onSelect,
  onBoundsChange,
}: {
  points: Point[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onBoundsChange: (bbox: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>();
  const cluster = useRef<L.MarkerClusterGroup>();
  const markers = useRef(new Map<string, L.Marker>());
  const cb = useRef({ onSelect, onBoundsChange });
  cb.current = { onSelect, onBoundsChange };

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: true }).fitBounds(BRAZIL);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    cluster.current = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 60,
      iconCreateFunction: (c) =>
        L.divIcon({
          className: '',
          html: `<div class="cluster-pin">${c.getChildCount().toLocaleString('pt-BR')}</div>`,
          iconSize: [44, 44],
        }),
    }).addTo(m);
    const report = () => cb.current.onBoundsChange(m.getBounds().toBBoxString());
    m.on('moveend', report);
    map.current = m;
    report();
    return () => {
      m.remove();
    };
  }, []);

  // Novo conjunto de pontos (filtros mudaram): redesenha e enquadra.
  useEffect(() => {
    const c = cluster.current!;
    c.clearLayers();
    markers.current.clear();
    const list = points.map(([id, lat, lng, price, exact]) => {
      const mk = L.marker([lat, lng], { icon: pin(price, exact) }).on('click', () => cb.current.onSelect(id));
      markers.current.set(id, mk);
      return mk;
    });
    c.addLayers(list);
    if (list.length) map.current!.fitBounds(c.getBounds(), { padding: [30, 30], maxZoom: 14 });
  }, [points]);

  // Destaca o marcador do card em foco (se não estiver dentro de um grupo).
  useEffect(() => {
    const mk = activeId ? markers.current.get(activeId) : undefined;
    mk?.getElement()?.firstElementChild?.classList.add('active');
    mk?.setZIndexOffset(1000);
    return () => {
      mk?.getElement()?.firstElementChild?.classList.remove('active');
      mk?.setZIndexOffset(0);
    };
  }, [activeId, points]);

  return <div ref={el} className="h-full w-full" />;
}
