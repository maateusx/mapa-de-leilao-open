import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  /** Seleção múltipla: `value` vira os valores unidos por MULTI_SEP. */
  multiple?: boolean;
}

/** Separador de valores múltiplos (vírgula não serve: há valores com vírgula). */
export const MULTI_SEP = '|';

/** Remove acentos para uma busca tolerante (ex.: "sao paulo" casa "São Paulo"). */
function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Select com autocomplete: campo de busca que filtra as opções enquanto digita.
 * Sem dependências externas — usa apenas estado local + clique-fora.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Buscar...',
  emptyText = 'Nenhum resultado.',
  className,
  disabled,
  multiple,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const values = multiple ? (value ? value.split(MULTI_SEP) : []) : [value];
  const isSelected = (v: string) => values.includes(v);
  const selectedLabels = options.filter((o) => o.value && isSelected(o.value)).map((o) => o.label);
  const display =
    selectedLabels.length > 2 ? `${selectedLabels.length} selecionados` : selectedLabels.join(', ');

  const filtered = React.useMemo(() => {
    if (!query.trim()) return options;
    const q = normalize(query);
    return options.filter((o) => normalize(o.label).includes(q));
  }, [options, query]);

  // Fecha ao clicar fora.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Ao abrir, foca o input e reseta a busca.
  React.useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // foco no próximo tick para garantir que o input já está montado
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Mantém a opção ativa visível ao navegar com o teclado.
  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function commit(option: ComboboxOption) {
    if (multiple && option.value) {
      const next = isSelected(option.value)
        ? values.filter((v) => v !== option.value)
        : [...values, option.value];
      onChange(next.join(MULTI_SEP));
      return; // mantém aberto para marcar outros
    }
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = filtered[activeIndex];
      if (option) commit(option);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        <span className={cn('line-clamp-1 text-left', !display && 'text-muted-foreground')}>
          {display || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
            ) : (
              filtered.map((o, i) => (
                <div
                  key={o.value}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected(o.value)}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => commit(o)}
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none',
                    i === activeIndex && 'bg-accent text-accent-foreground'
                  )}
                >
                  {(multiple ? !!o.value && isSelected(o.value) : o.value === value) && (
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                  <span className="line-clamp-1">{o.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
