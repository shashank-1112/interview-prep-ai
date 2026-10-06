import { Copy, CopyPlus, Grid3x3, LayoutGrid, MapPin, PencilLine, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { Button, formatPrice } from '../components/ui';
import { annotationMeta, stallColorFor, stallStatusLabelFor, UNIT_LABELS } from '../domain/constants';
import { statusCounts } from '../domain/layoutOps';
import { formatLength, groundLocation, inferSide, parkingCapacity, sideLabel } from '../domain/site';
import type { StallLayoutData, StallStatus } from '../domain/types';
import { deleteAnnotation, deleteHangar, duplicateHangar } from '../store/actions';
import { useLayoutStore } from '../store/layoutStore';
import { MOD } from '../hooks/shortcuts';
import { DetailRow, StallDetails } from './StallDetails';

function StatusSummary({ counts, total }: { counts: Record<StallStatus, number>; total: number }) {
  const config = useLayoutStore((s) => s.layoutConfig);
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        {(Object.keys(counts) as StallStatus[]).map((k) =>
          counts[k] ? <div key={k} style={{ width: `${(counts[k] / total) * 100}%`, background: stallColorFor(config, k).stroke }} /> : null,
        )}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
        {(Object.keys(counts) as StallStatus[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: stallColorFor(config, k).fill, boxShadow: `inset 0 0 0 1.5px ${stallColorFor(config, k).stroke}` }} aria-hidden />
            <span className="text-slate-600">{stallStatusLabelFor(config, k)}</span>
            <span className="ml-auto font-medium tabular-nums text-slate-900">{counts[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Overview({ data }: { data: StallLayoutData }) {
  const counts = useMemo(() => statusCounts(data.stalls), [data.stalls]);
  const revenue = useMemo(() => {
    let booked = 0;
    let pipeline = 0;
    for (const s of data.stalls) {
      if (s.status === 'booked') booked += s.finalPrice;
      else if (s.status === 'reserved') pipeline += s.finalPrice;
    }
    return { booked, pipeline };
  }, [data.stalls]);
  const total = data.stalls.length || 1;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Overview</p>
        <h2 className="text-lg font-semibold text-slate-900">{data.ground.exhibitionName || 'Untitled exhibition'}</h2>
        <p className="text-xs text-slate-500">
          {data.ground.venueName} · {data.ground.width}×{data.ground.height} {UNIT_LABELS[data.ground.unit]}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Hangars', data.hangars.length],
          ['Stalls', data.stalls.length],
          ['Markers', data.annotations.length],
        ].map(([l, v]) => (
          <div key={l} className="rounded-md border border-slate-200 py-2">
            <div className="text-lg font-semibold tabular-nums">{v}</div>
            <div className="text-xs text-slate-500">{l}</div>
          </div>
        ))}
      </div>
      {data.stalls.length > 0 && <StatusSummary counts={counts} total={total} />}
      <dl className="divide-y divide-slate-100 rounded-md border border-slate-200 px-3">
        <DetailRow label="Booked revenue">{formatPrice(revenue.booked)}</DetailRow>
        <DetailRow label="Reserved (pipeline)">{formatPrice(revenue.pipeline)}</DetailRow>
      </dl>
      <p className="text-xs text-slate-500">Select a hangar, stall or marker on the canvas. Double-click a hangar to edit its stalls.</p>
    </div>
  );
}

export function DetailsPanel({ data }: { data: StallLayoutData }) {
  const sel = useLayoutStore((s) => s.groundSelection);
  const canManage = useLayoutStore((s) => s.canManageLayout);
  const openEditor = useLayoutStore((s) => s.openEditor);
  const openModal = useLayoutStore((s) => s.openModal);
  const unit = UNIT_LABELS[data.ground.unit];

  if (sel?.kind === 'hangar') {
    const h = data.hangars.find((x) => x.id === sel.id);
    if (!h) return <Overview data={data} />;
    const stalls = data.stalls.filter((s) => s.hangarId === h.id);
    const counts = statusCounts(stalls);
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Hangar</p>
          <h2 className="text-lg font-semibold text-slate-900">{h.name}</h2>
          <p className="text-xs text-slate-500">{h.code}</p>
        </div>
        <Button variant="primary" className="w-full" icon={<SquareArrowOutUpRight size={15} />} onClick={() => openEditor(h.id)}>
          Open Hangar Editor
        </Button>
        <dl className="divide-y divide-slate-100 rounded-md border border-slate-200 px-3">
          <DetailRow label="Position">
            {h.x}, {h.y} {unit}
          </DetailRow>
          <DetailRow label="Size">
            {h.width} × {h.height} {unit}
          </DetailRow>
          <DetailRow label="Stalls">{stalls.length}</DetailRow>
          <DetailRow label="Markers">{data.annotations.filter((a) => a.hangarId === h.id).length}</DetailRow>
        </dl>
        {stalls.length > 0 && <StatusSummary counts={counts} total={stalls.length} />}
        {canManage && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="sm" icon={<PencilLine size={14} />} onClick={() => openModal({ kind: 'editHangar', hangarId: h.id })}>
                Edit hangar
              </Button>
              <Button size="sm" icon={<LayoutGrid size={14} />} onClick={() => openModal({ kind: 'generateStalls', hangarId: h.id })}>
                Generate stalls
              </Button>
              <Button size="sm" icon={<MapPin size={14} />} onClick={() => openModal({ kind: 'annotation', hangarId: h.id, annotationId: null })}>
                Add marker
              </Button>
              <Button size="sm" icon={<Copy size={14} />} onClick={() => duplicateHangar(h.id, false)} title="Same-size empty hangar next to this one">
                Duplicate
              </Button>
              <Button
                size="sm"
                icon={<CopyPlus size={14} />}
                onClick={() => duplicateHangar(h.id, true)}
                disabled={stalls.length === 0 && data.annotations.every((a) => a.hangarId !== h.id)}
                title={`Copy with its stalls, reset to available (${MOD}+D)`}
              >
                Duplicate + stalls
              </Button>
            </div>
            <Button size="sm" variant="ghost" className="w-full text-red-600 hover:bg-red-50 hover:text-red-700" icon={<Trash2 size={14} />} onClick={() => deleteHangar(h.id)}>
              Delete hangar
            </Button>
          </>
        )}
      </div>
    );
  }

  if (sel?.kind === 'stall') {
    const s = data.stalls.find((x) => x.id === sel.id);
    if (!s) return <Overview data={data} />;
    const hangar = data.hangars.find((h) => h.id === s.hangarId);
    return (
      <StallDetails
        stall={s}
        hangar={hangar}
        unit={data.ground.unit}
        extraActions={
          <Button
            size="sm"
            icon={<Grid3x3 size={14} />}
            onClick={() => {
              openEditor(s.hangarId);
              useLayoutStore.getState().setEditorStalls([s.id]);
            }}
          >
            Show in editor
          </Button>
        }
      />
    );
  }

  if (sel?.kind === 'annotation') {
    const a = data.annotations.find((x) => x.id === sel.id);
    if (!a) return <Overview data={data} />;
    const meta = annotationMeta(a.type);
    const location = groundLocation(a, data.ground);
    const side = location === 'outside' ? inferSide(a, data.ground) : null;
    const g = data.ground;
    const gap = side ? { top: -(a.y + a.height), bottom: a.y - g.height, left: -(a.x + a.width), right: a.x - g.width }[side] : null;
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{a.type === 'road' ? 'Road' : a.type === 'parking' ? 'Parking' : 'Marker'}</p>
          <h2 className="text-lg font-semibold text-slate-900">
            <span aria-hidden>{meta.emoji}</span> {a.label}
          </h2>
          <p className="text-xs text-slate-500">
            {meta.label} · {location === 'outside' ? 'outside the ground' : location === 'inside' ? 'inside the ground' : 'across the ground edge'}
          </p>
        </div>
        <dl className="divide-y divide-slate-100 rounded-md border border-slate-200 px-3">
          {side && <DetailRow label="Beside">{sideLabel(side)} side</DetailRow>}
          {gap !== null && <DetailRow label="Gap from ground">{formatLength(Math.max(0, gap), g.unit)}</DetailRow>}
          {a.type === 'road' ? (
            <>
              <DetailRow label="Length">{formatLength(Math.max(a.width, a.height), g.unit)}</DetailRow>
              <DetailRow label="Road width">{formatLength(Math.min(a.width, a.height), g.unit)}</DetailRow>
            </>
          ) : (
            <DetailRow label="Size">
              {a.width} × {a.height} {unit}
            </DetailRow>
          )}
          {a.type === 'parking' && (
            <DetailRow label="Capacity (est.)">≈ {parkingCapacity(a.width, a.height, g.unit)} cars</DetailRow>
          )}
          <DetailRow label="Position">
            {a.x}, {a.y} {unit}
          </DetailRow>
        </dl>
        {canManage && (
          <div className="flex gap-1.5">
            <Button size="sm" icon={<PencilLine size={14} />} onClick={() => openModal({ kind: 'annotation', hangarId: null, annotationId: a.id })}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700" icon={<Trash2 size={14} />} onClick={() => deleteAnnotation(a.id)}>
              Delete
            </Button>
          </div>
        )}
        {canManage && !useLayoutStore.getState().editMode && <p className="text-xs text-slate-500">Turn on Edit Layout to move or resize it.</p>}
        {a.type === 'road' && <p className="text-xs text-slate-500">Roads always stay outside the ground — a drop onto the ground is reverted.</p>}
      </div>
    );
  }

  return <Overview data={data} />;
}
