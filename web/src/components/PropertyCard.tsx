import { Link } from 'react-router-dom';
import { Bed, Calendar, Car, Fuel, Gauge, MapPin, Maximize, Building2 } from 'lucide-react';
import type { Property } from '@/lib/api';
import { formatCurrency, formatArea, formatDiscount, formatKm, formatYear } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TYPE_GRADIENT: Record<string, string> = {
  Apartamento: 'from-sky-500 to-indigo-600',
  Casa: 'from-emerald-500 to-teal-600',
  Terreno: 'from-amber-500 to-orange-600',
  Sala: 'from-violet-500 to-purple-600',
  Loja: 'from-rose-500 to-pink-600',
  Prédio: 'from-slate-500 to-slate-700',
};

function Thumb({ property, className }: { property: Property; className?: string }) {
  const gradient = TYPE_GRADIENT[property.propertyType] ?? 'from-slate-500 to-slate-700';
  const discount = formatDiscount(property.discount);
  return (
    <div
      className={cn(
        'relative flex items-center justify-center bg-gradient-to-br text-white/90',
        gradient,
        className
      )}
    >
      {property.images?.[0] ? (
        <img src={property.images[0]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <Building2 className="h-10 w-10 opacity-60" />
      )}
      {discount && (
        <Badge variant="success" className="absolute left-2 top-2 shadow">
          {discount}
        </Badge>
      )}
      <Badge variant="secondary" className="absolute right-2 top-2 shadow">
        {property.propertyType}
      </Badge>
    </div>
  );
}

function Specs({ property }: { property: Property }) {
  const area = formatArea(property.privateArea) ?? formatArea(property.totalArea);
  const year = formatYear(property);
  const km = formatKm(property.km);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {year && (
        <span className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" /> {year}
        </span>
      )}
      {km && (
        <span className="flex items-center gap-1">
          <Gauge className="h-3.5 w-3.5" /> {km}
        </span>
      )}
      {property.fuel && (
        <span className="flex items-center gap-1">
          <Fuel className="h-3.5 w-3.5" /> {property.fuel}
        </span>
      )}
      {area && (
        <span className="flex items-center gap-1">
          <Maximize className="h-3.5 w-3.5" /> {area}
        </span>
      )}
      {property.bedrooms ? (
        <span className="flex items-center gap-1">
          <Bed className="h-3.5 w-3.5" /> {property.bedrooms}
        </span>
      ) : null}
      {property.parkingSpaces ? (
        <span className="flex items-center gap-1">
          <Car className="h-3.5 w-3.5" /> {property.parkingSpaces}
        </span>
      ) : null}
    </div>
  );
}

function Price({ property }: { property: Property }) {
  return (
    <div>
      <p className="text-lg font-bold text-foreground">{formatCurrency(property.price)}</p>
      {property.appraisalValue && property.appraisalValue > property.price && (
        <p className="text-xs text-muted-foreground line-through">
          {formatCurrency(property.appraisalValue)}
        </p>
      )}
    </div>
  );
}

export function PropertyCard({ property, view }: { property: Property; view: 'grid' | 'list' }) {
  const location = `${property.neighborhood ? property.neighborhood + ', ' : ''}${property.city} - ${property.state}`;
  const heading = property.title || property.address || location;

  if (view === 'list') {
    return (
      <Link
        to={`/imovel/${property._id}`}
        target="_blank"
        rel="noopener"
        className="group flex gap-4 rounded-lg border bg-card p-3 transition-colors hover:border-primary/50"
      >
        <Thumb property={property} className="h-28 w-40 shrink-0 rounded-md" />
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <div className="space-y-1">
            <h3 className="truncate font-semibold group-hover:text-primary">{heading}</h3>
            <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" /> {location}
            </p>
            <Specs property={property} />
          </div>
          <div className="flex items-end justify-between gap-2">
            <Price property={property} />
            <Badge variant="outline" className="shrink-0">{property.saleModality}</Badge>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/imovel/${property._id}`}
      target="_blank"
      rel="noopener"
      className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
    >
      <Thumb property={property} className="h-36 w-full" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 font-semibold group-hover:text-primary">{heading}</h3>
        <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" /> {location}
        </p>
        <Specs property={property} />
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <Price property={property} />
          <Badge variant="outline" className="shrink-0 text-[10px]">{property.saleModality}</Badge>
        </div>
      </div>
    </Link>
  );
}
