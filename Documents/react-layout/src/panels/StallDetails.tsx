import { PencilLine, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, formatPrice, StatusBadge } from '../components/ui';
import { CORNER_ORIENTATIONS, UNIT_LABELS } from '../domain/constants';
import type { Hangar, LayoutUnit, Stall } from '../domain/types';
import { deleteStalls, toggleStallOpenSide } from '../store/actions';
import { OpenSidesPicker, sideStates } from './OpenSidesPicker';
import { useLayoutStore } from '../store/layoutStore';
import { QuickActions } from './QuickActions';

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{children}</dd>
    </div>
  );
}

export function StallDetails({ stall, hangar, unit, extraActions }: { stall: Stall; hangar?: Hangar | undefined; unit: LayoutUnit; extraActions?: ReactNode }) {
  const openModal = useLayoutStore((s) => s.openModal);
  const u = UNIT_LABELS[unit];
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Stall</p>
          <h2 className="text-lg font-semibold text-slate-900">{stall.stallNo}</h2>
          {hangar && <p className="text-xs text-slate-500">{hangar.name}</p>}
        </div>
        <StatusBadge status={stall.status} />
      </div>
      <dl className="divide-y divide-slate-100 rounded-md border border-slate-200 px-3">
        <DetailRow label="Type">
          {stall.stallType}
          {stall.stallType === 'Corner' && (
            <span className="ml-1 text-xs font-normal text-slate-500">
              ({CORNER_ORIENTATIONS.find((c) => c.value === (stall.cornerOrientation ?? 'top-right'))?.label})
            </span>
          )}
        </DetailRow>
        <DetailRow label="Size">
          {stall.width} × {stall.height} {u} <span className="text-xs font-normal text-slate-500">({stall.area} {u}²)</span>
        </DetailRow>
        <DetailRow label="Position">
          {stall.x}, {stall.y}
        </DetailRow>
        <DetailRow label="Base price">{formatPrice(stall.basePrice)}</DetailRow>
        <DetailRow label="Final price">{formatPrice(stall.finalPrice)}</DetailRow>
        <DetailRow label="Exhibitor">{stall.exhibitorName ?? <span className="font-normal text-slate-400">—</span>}</DetailRow>
      </dl>
      <section aria-label="Open sides">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Open sides</h3>
        <OpenSidesPicker state={sideStates([stall])} onToggle={(side) => toggleStallOpenSide([stall.id], side)} size="sm" />
      </section>
      <section aria-label="Booking">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Booking</h3>
        <QuickActions stall={stall} />
      </section>
      <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
        <Button size="sm" icon={<PencilLine size={14} />} onClick={() => openModal({ kind: 'editStall', stallId: stall.id })}>
          Edit
        </Button>
        {extraActions}
        <Button size="sm" variant="ghost" className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700" icon={<Trash2 size={14} />} onClick={() => deleteStalls([stall.id])}>
          Delete
        </Button>
      </div>
    </div>
  );
}
