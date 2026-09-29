import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, cx, formatPrice, Input, Select, StatusBadge } from '../components/ui';
import { STALL_STATUSES, STALL_TYPES, STATUS_LABELS } from '../domain/constants';
import { filterStalls, type BulkAction } from '../domain/layoutOps';
import type { StallLayoutData, StallStatus } from '../domain/types';
import { runBulkAction } from '../store/actions';
import { useLayoutStore } from '../store/layoutStore';
import { FilterPanel } from './FilterPanel';

const PAGE_SIZES = [10, 25, 50, 100];

function IndeterminateCheckbox({ checked, indeterminate, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return <input ref={ref} type="checkbox" checked={checked} className="h-4 w-4 rounded border-slate-300 accent-blue-600" {...rest} />;
}

type Mode = 'status' | 'price' | 'type' | 'delete';

function BulkBar({ count, onClear }: { count: number; onClear: () => void }) {
  const [mode, setMode] = useState<Mode>('status');
  const [status, setStatus] = useState<StallStatus>('available');
  const [price, setPrice] = useState('');
  const [type, setType] = useState<string>(STALL_TYPES[0]);
  const priceNum = Number(price);
  const priceInvalid = mode === 'price' && (price.trim() === '' || !Number.isFinite(priceNum) || priceNum < 0);

  const apply = () => {
    let action: BulkAction;
    if (mode === 'status') action = { kind: 'status', status };
    else if (mode === 'price') action = { kind: 'price', finalPrice: priceNum };
    else if (mode === 'type') action = { kind: 'type', stallType: type };
    else action = { kind: 'delete' };
    runBulkAction(action);
  };

  return (
    <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/60 p-2.5" role="region" aria-label="Bulk actions">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-blue-900" aria-live="polite">
          {count} stall{count === 1 ? '' : 's'} selected
        </span>
        <button type="button" className="text-blue-700 underline-offset-2 hover:underline" onClick={onClear}>
          Clear selection
        </button>
      </div>
      <div className="flex gap-2">
        <Select aria-label="Bulk action" value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="w-32 shrink-0">
          <option value="status">Set status</option>
          <option value="price">Set price</option>
          <option value="type">Set type</option>
          <option value="delete">Delete</option>
        </Select>
        {mode === 'status' && (
          <Select aria-label="New status" value={status} onChange={(e) => setStatus(e.target.value as StallStatus)}>
            {STALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        )}
        {mode === 'price' && (
          <Input aria-label="New final price" type="number" min={0} placeholder="Final price ₹" value={price} invalid={priceInvalid && price !== ''} onChange={(e) => setPrice(e.target.value)} />
        )}
        {mode === 'type' && (
          <Select aria-label="New stall type" value={type} onChange={(e) => setType(e.target.value)}>
            {STALL_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        )}
        {mode === 'delete' && <div className="flex-1" />}
        <Button variant={mode === 'delete' ? 'danger' : 'primary'} onClick={apply} disabled={priceInvalid} className="shrink-0">
          Apply
        </Button>
      </div>
    </div>
  );
}

export default function BulkActionsPanel({ data }: { data: StallLayoutData }) {
  const bulk = useLayoutStore((s) => s.bulk);
  const setPage = useLayoutStore((s) => s.setPage);
  const setPageSize = useLayoutStore((s) => s.setPageSize);
  const setBulkSelection = useLayoutStore((s) => s.setBulkSelection);
  const selectGround = useLayoutStore((s) => s.selectGround);

  const filtered = useMemo(() => filterStalls(data, bulk.filters), [data, bulk.filters]);
  const hangarNames = useMemo(() => new Map(data.hangars.map((h) => [h.id, h.name])), [data.hangars]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / bulk.pageSize));
  const page = Math.min(bulk.page, pageCount);
  const rows = filtered.slice((page - 1) * bulk.pageSize, page * bulk.pageSize);
  const selected = bulk.selectedIds;

  const pageAll = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const pageSome = rows.some((r) => selected.has(r.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setBulkSelection(next);
  };
  const togglePage = () => {
    const next = new Set(selected);
    for (const r of rows) {
      if (pageAll) next.delete(r.id);
      else next.add(r.id);
    }
    setBulkSelection(next);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <FilterPanel hangars={data.hangars} />
      {selected.size > 0 && <BulkBar count={selected.size} onClear={() => setBulkSelection([])} />}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span aria-live="polite">
          {filtered.length} of {data.stalls.length} stalls
        </span>
        {filtered.length > 0 && !allFilteredSelected && (
          <button
            type="button"
            className="font-medium text-blue-700 underline-offset-2 hover:underline"
            onClick={() => setBulkSelection(new Set([...selected, ...filtered.map((s) => s.id)]))}
          >
            Select all {filtered.length} filtered
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Stalls, page {page} of {pageCount}</caption>
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th scope="col" className="w-8 px-2 py-2">
                <IndeterminateCheckbox checked={pageAll} indeterminate={pageSome} onChange={togglePage} aria-label="Select all stalls on this page" />
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Stall
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Status
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Price
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.id} className={cx('hover:bg-slate-50', selected.has(s.id) && 'bg-blue-50/50')}>
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    aria-label={`Select stall ${s.stallNo}`}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    className="text-left font-medium text-slate-900 hover:text-blue-700 hover:underline"
                    onClick={() => selectGround({ kind: 'stall', id: s.id })}
                  >
                    {s.stallNo}
                  </button>
                  <div className="text-xs text-slate-500">
                    {hangarNames.get(s.hangarId)} · {s.stallType}
                    {s.exhibitorName ? ` · ${s.exhibitorName}` : ''}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatPrice(s.finalPrice)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-500">
                  No stalls match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav className="flex items-center justify-between gap-2 text-xs" aria-label="Pagination">
        <label className="flex items-center gap-1.5 text-slate-500">
          Rows
          <Select className="h-8 w-16 px-2 text-xs" value={bulk.pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </Select>
        </label>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft size={15} />
          </Button>
          <span className="tabular-nums text-slate-600">
            {page} / {pageCount}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">
            <ChevronRight size={15} />
          </Button>
        </div>
      </nav>
    </div>
  );
}
