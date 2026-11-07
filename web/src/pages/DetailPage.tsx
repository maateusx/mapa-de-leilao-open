import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bed,
  Building2,
  Car,
  ExternalLink,
  Hash,
  Landmark,
  Map as MapIcon,
  MapPin,
  Maximize,
  Ruler,
  Trees,
  Calendar,
  Gauge,
  Fuel,
  Palette,
  Tag,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatCurrency, formatArea, formatDiscount, formatKm, formatYear } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

const ORIGIN_NAME: Record<string, string> = {
  caixa: 'Caixa Econômica Federal',
  bradesco: 'Bradesco',
};

function Spec({ icon: Icon, label, value }: { icon: typeof Bed; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <Icon className="h-5 w-5 text-primary" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}

export function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: p, isLoading, isError } = useQuery({
    queryKey: ['property', id],
    queryFn: () => api.getProperty(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !p) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center">
        <p className="text-muted-foreground">Lote não encontrado.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/">Voltar para a lista</Link>
        </Button>
      </div>
    );
  }

  const discount = formatDiscount(p.discount);
  const location = `${p.neighborhood ? p.neighborhood + ', ' : ''}${p.city} - ${p.state}`;
  const fullAddress = [p.address, p.neighborhood, `${p.city} - ${p.state}`, 'Brasil']
    .filter(Boolean)
    .join(', ');
  const mapQuery = encodeURIComponent(fullAddress);
  const mapEmbedUrl = `https://www.google.com/maps?q=${mapQuery}&output=embed`;
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const specs = [
    formatArea(p.privateArea) && { icon: Maximize, label: 'Área privativa', value: formatArea(p.privateArea)! },
    formatArea(p.totalArea) && { icon: Ruler, label: 'Área total', value: formatArea(p.totalArea)! },
    formatArea(p.landArea) && { icon: Trees, label: 'Terreno', value: formatArea(p.landArea)! },
    p.bedrooms && { icon: Bed, label: 'Quartos', value: String(p.bedrooms) },
    p.parkingSpaces && { icon: Car, label: 'Vagas', value: String(p.parkingSpaces) },
    p.brand && { icon: Tag, label: 'Marca', value: p.brand },
    p.model && { icon: Car, label: 'Modelo', value: p.model },
    formatYear(p) && { icon: Calendar, label: 'Ano (fab./modelo)', value: formatYear(p)! },
    formatKm(p.km) && { icon: Gauge, label: 'Quilometragem', value: formatKm(p.km)! },
    p.fuel && { icon: Fuel, label: 'Combustível', value: p.fuel },
    p.color && { icon: Palette, label: 'Cor', value: p.color },
    p.damage && { icon: AlertTriangle, label: 'Dano', value: p.damage },
  ].filter(Boolean) as { icon: typeof Bed; label: string; value: string }[];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
      </Button>

      <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white sm:h-64">
        {p.images?.[0] ? (
          <img src={p.images[0]} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <Building2 className="h-20 w-20 opacity-50" />
        )}
        <div className="absolute left-4 top-4 flex gap-2">
          <Badge variant="secondary">{p.propertyType}</Badge>
          <Badge variant="outline" className="border-white/40 text-white">{p.saleModality}</Badge>
        </div>
        {discount && (
          <Badge variant="success" className="absolute right-4 top-4 text-sm shadow">
            {discount}
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div>
            <h1 className="text-2xl font-bold">{p.title || p.address || location}</h1>
            <p className="mt-1 flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-4 w-4" /> {location}
            </p>
          </div>

          {specs.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {specs.map((s) => (
                <Spec key={s.label} {...s} />
              ))}
            </div>
          )}

          {p.images?.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {p.images.map((src) => (
                <a key={src} href={src} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <img src={src} alt="" loading="lazy" className="h-24 w-36 rounded-md border object-cover" />
                </a>
              ))}
            </div>
          )}

          {p.description && (
            <div>
              <h2 className="mb-2 font-semibold">Descrição</h2>
              <p className="leading-relaxed text-muted-foreground">{p.description}</p>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Localização</h2>
              <Button asChild variant="outline" size="sm">
                <a href={mapLink} target="_blank" rel="noopener noreferrer">
                  <MapIcon className="h-4 w-4" /> Abrir no Google Maps
                </a>
              </Button>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">{fullAddress}</p>
            <a
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-xl border"
              title="Abrir no Google Maps"
            >
              <iframe
                title="Mapa do imóvel"
                src={mapEmbedUrl}
                className="pointer-events-none h-64 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </a>
          </div>

          <Separator />

          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Landmark className="h-4 w-4" /> Origem: {ORIGIN_NAME[p.origin] ?? p.origin}
            </p>
            <p className="flex items-center gap-2">
              <Hash className="h-4 w-4" /> Nº do lote: {p.externalId}
            </p>
            <p>Financiamento: {p.financing ? 'Aceita' : 'Não informado / não aceita'}</p>
          </div>
        </div>

        {/* Coluna de preço + CTA */}
        <div className="lg:col-span-1">
          <Card className="sticky top-20">
            <CardContent className="space-y-4 p-6">
              {p.appraisalValue && p.appraisalValue > p.price && (
                <p className="text-sm text-muted-foreground">
                  Avaliação:{' '}
                  <span className="line-through">{formatCurrency(p.appraisalValue)}</span>
                </p>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Valor de venda</p>
                <p className="text-3xl font-bold text-primary">{formatCurrency(p.price)}</p>
              </div>
              {discount && (
                <Badge variant="success" className="text-sm">{discount}</Badge>
              )}
              <Separator />
              <Button asChild size="lg" className="w-full" disabled={!p.link}>
                <a href={p.link} target="_blank" rel="noopener noreferrer">
                  Ver no leilão <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Você será direcionado ao site de origem para dar o lance.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
