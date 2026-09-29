import { Search, X } from 'lucide-react';
import { useId } from 'react';
import { Button, Input, Select } from '../components/ui';
import { STALL_STATUSES, STALL_TYPES, STATUS_LABELS } from '../domain/constants';
import { hasActiveFilters } from '../domain/layoutOps';
import type { Hangar, StallStatus } from '../domain/types';
import { useLayoutStore } from '../store/layoutStore';

export function FilterPanel({ hangars }: { hangars: Hangar[] }) {
  const filters = useLayoutStore((s) => s.bulk.filters);
  const setFilters = useLayoutStore((s) => s.setFilters);
  const resetFilters = useLayoutStore((s) => s.resetFilters);
  const id = useId();
  const parsePrice = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

  return (
    <div className="space-y-2" role="search" aria-label="Filter stalls">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
        <label htmlFor={`${id}-q`} className="sr-only">
          Search stalls
        </label>
        <Input
          id={`${id}-q`}
          type="search"
          placeholder="Search stall no., exhibitor, hangar…"
          className="pl-8"
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label htmlFor={`${id}-h`} className="sr-only">
            Hangar
          </label>
          <Select className="px-2 text-xs" id={`${id}-h`} value={filters.hangarId ?? ''} onChange={(e) => setFilters({ hangarId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">All hangars</option>
            {hangars.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={`${id}-s`} className="sr-only">
            Status
          </label>
          <Select className="px-2 text-xs" id={`${id}-s`} value={filters.status} onChange={(e) => setFilters({ status: e.target.value as StallStatus | '' })}>
            <option value="">All statuses</option>
            {STALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={`${id}-t`} className="sr-only">
            Stall type
          </label>
          <Select className="px-2 text-xs" id={`${id}-t`} value={filters.stallType} onChange={(e) => setFilters({ stallType: e.target.value })}>
            <option value="">All types</option>
            {STALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-min`} className="shrink-0 text-xs text-slate-500">
          Price ₹
        </label>
        <Input
          id={`${id}-min`}
          type="number"
          min={0}
          placeholder="Min"
          aria-label="Minimum final price"
          value={filters.priceMin ?? ''}
          onChange={(e) => setFilters({ priceMin: parsePrice(e.target.value) })}
        />
        <span className="text-slate-400" aria-hidden>
          –
        </span>
        <Input
          type="number"
          min={0}
          placeholder="Max"
          aria-label="Maximum final price"
          value={filters.priceMax ?? ''}
          onChange={(e) => setFilters({ priceMax: parsePrice(e.target.value) })}
        />
        <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={resetFilters} disabled={!hasActiveFilters(filters)} aria-label="Clear filters">
          Clear
        </Button>
      </div>
    </div>
  );
}
