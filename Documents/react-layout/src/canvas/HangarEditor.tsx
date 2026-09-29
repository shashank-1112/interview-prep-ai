import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowLeft,
  Combine,
  Copy,
  Hand,
  Keyboard,
  LayoutGrid,
  MapPin,
  PencilLine,
  Redo2,
  Ruler,
  SquarePlus,
  SquareSplitHorizontal,
  SquareSplitVertical,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, formatPrice, IconButton, ToolbarDivider } from '../components/ui';
import { annotationMeta, UNIT_LABELS } from '../domain/constants';
import { canSplitStall, mergeCandidate, statusCounts } from '../domain/layoutOps';
import type { Hangar, StallLayoutData } from '../domain/types';
import { MOD } from '../hooks/shortcuts';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { EditorA11yList } from '../panels/CanvasA11y';
import { OpenSidesPicker, sideStates } from '../panels/OpenSidesPicker';
import { DetailRow, StallDetails } from '../panels/StallDetails';
import {
  alignSelection,
  deleteAnnotation,
  deleteStalls,
  distributeSelection,
  duplicateSelection,
  mergeSelection,
  splitSelection,
  toggleStallOpenSide,
} from '../store/actions';
import { useLayoutStore } from '../store/layoutStore';
import { HangarEditorStage } from './HangarEditorStage';

function SelectionPanel({ data, hangar }: { data: StallLayoutData; hangar: Hangar }) {
  const editor = useLayoutStore((s) => s.editor);
  const openModal = useLayoutStore((s) => s.openModal);
  const setEditorStalls = useLayoutStore((s) => s.setEditorStalls);
  const unit = UNIT_LABELS[data.ground.unit];

  if (editor.annotationId !== null) {
    const a = data.annotations.find((x) => x.id === editor.annotationId);
    if (a) {
      const meta = annotationMeta(a.type);
      return (
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Marker</p>
            <h2 className="text-lg font-semibold">
              <span aria-hidden>{meta.emoji}</span> {a.label}
            </h2>
            <p className="text-xs text-slate-500">{meta.label}</p>
          </div>
          <dl className="divide-y divide-slate-100 rounded-md border border-slate-200 px-3">
            <DetailRow label="Position">
              {a.x}, {a.y} {unit}
            </DetailRow>
            <DetailRow label="Size">
              {a.width} × {a.height} {unit}
            </DetailRow>
          </dl>
          <div className="flex gap-1.5">
            <Button size="sm" icon={<PencilLine size={14} />} onClick={() => openModal({ kind: 'annotation', hangarId: hangar.id, annotationId: a.id })}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto text-red-600 hover:bg-red-50" icon={<Trash2 size={14} />} onClick={() => deleteAnnotation(a.id)}>
              Delete
            </Button>
          </div>
        </div>
      );
    }
  }

  const selected = data.stalls.filter((s) => editor.stallIds.has(s.id));
  if (selected.length === 1) return <StallDetails stall={selected[0]!} hangar={hangar} unit={data.ground.unit} />;
  if (selected.length > 1) {
    const counts = statusCounts(selected);
    const value = selected.reduce((acc, s) => acc + s.finalPrice, 0);
    const area = selected.reduce((acc, s) => acc + s.area, 0);
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Selection</p>
          <h2 className="text-lg font-semibold">{selected.length} stalls</h2>
        </div>
        <dl className="divide-y divide-slate-100 rounded-md border border-slate-200 px-3">
          <DetailRow label="Total area">
            {Math.round(area * 100) / 100} {unit}²
          </DetailRow>
          <DetailRow label="Total final price">{formatPrice(value)}</DetailRow>
          <DetailRow label="Available / Reserved">
            {counts.available} / {counts.reserved}
          </DetailRow>
          <DetailRow label="Booked / Blocked">
            {counts.booked} / {counts.blocked}
          </DetailRow>
        </dl>
        <section aria-label="Open sides">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Open sides (all selected)</h3>
          <OpenSidesPicker
            state={sideStates(selected)}
            onToggle={(side) => toggleStallOpenSide(editor.stallIds, side)}
            caption="Click a side to open it on every selected stall; click again to wall it."
            size="sm"
          />
        </section>
        <p className="text-xs text-slate-500">
          Use the toolbar to align, distribute, duplicate or merge. Drag any selected stall to move them together; drag a handle to resize.
        </p>
        <div className="flex gap-1.5">
          <Button size="sm" onClick={() => setEditorStalls([])}>
            Clear selection
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto text-red-600 hover:bg-red-50" icon={<Trash2 size={14} />} onClick={() => deleteStalls(editor.stallIds)}>
            Delete {selected.length}
          </Button>
        </div>
      </div>
    );
  }

  const stalls = data.stalls.filter((s) => s.hangarId === hangar.id);
  const counts = statusCounts(stalls);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Hangar</p>
        <h2 className="text-lg font-semibold">{hangar.name}</h2>
        <p className="text-xs text-slate-500">
          {hangar.code} · {hangar.width}×{hangar.height} {unit}
        </p>
      </div>
      <dl className="divide-y divide-slate-100 rounded-md border border-slate-200 px-3">
        <DetailRow label="Stalls">{stalls.length}</DetailRow>
        <DetailRow label="Available">{counts.available}</DetailRow>
        <DetailRow label="Reserved">{counts.reserved}</DetailRow>
        <DetailRow label="Booked">{counts.booked}</DetailRow>
        <DetailRow label="Blocked">{counts.blocked}</DetailRow>
      </dl>
      <ul className="list-disc space-y-1 pl-4 text-xs text-slate-500">
        <li>Click a stall to select it; Shift+click or drag a marquee to select several.</li>
        <li>Hold Space (or use the hand tool) and drag to pan; scroll to zoom.</li>
        <li>Stalls outlined in red dashes overlap another stall.</li>
      </ul>
    </div>
  );
}

export default function HangarEditor({ hangarId }: { hangarId: number }) {
  const data = useLayoutStore((s) => s.data);
  const editor = useLayoutStore((s) => s.editor);
  const closeEditor = useLayoutStore((s) => s.closeEditor);
  const openModal = useLayoutStore((s) => s.openModal);
  const showDimensions = useLayoutStore((s) => s.showDimensions);
  const setShowDimensions = useLayoutStore((s) => s.setShowDimensions);
  const { canUndo, canRedo, undo, redo } = useUndoRedo();
  const [panMode, setPanMode] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const hangar = data?.hangars.find((h) => h.id === hangarId);
  const stalls = useMemo(() => data?.stalls.filter((s) => s.hangarId === hangarId) ?? [], [data?.stalls, hangarId]);
  const annotations = useMemo(() => data?.annotations.filter((a) => a.hangarId === hangarId) ?? [], [data?.annotations, hangarId]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  if (!data || !hangar) return null;

  const n = editor.stallIds.size;
  const grid = data.ground.gridSize;
  const single = n === 1 ? data.stalls.find((s) => editor.stallIds.has(s.id)) : undefined;
  const canMerge = mergeCandidate(data.stalls, editor.stallIds) !== null;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Hangar editor: ${hangar.name}`}
      className="fixed inset-0 z-40 flex flex-col bg-white outline-none"
      data-testid="hangar-editor"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200 px-3 py-2">
        <Button size="sm" variant="ghost" icon={<ArrowLeft size={15} />} onClick={closeEditor} aria-label="Back to ground view">
          Ground
        </Button>
        <div className="mr-2 min-w-0">
          <h1 className="truncate text-sm font-semibold text-slate-900">{hangar.name}</h1>
          <p className="text-xs text-slate-500">
            {hangar.code} · {hangar.width}×{hangar.height} {UNIT_LABELS[data.ground.unit]} · {stalls.length} stalls
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Hangar editor tools">
          <Button size="sm" variant="primary" icon={<LayoutGrid size={14} />} onClick={() => openModal({ kind: 'generateStalls', hangarId })}>
            Generate
          </Button>
          <IconButton label="Add stall" onClick={() => openModal({ kind: 'addStall', hangarId })}>
            <SquarePlus size={17} />
          </IconButton>
          <IconButton label="Add marker" onClick={() => openModal({ kind: 'annotation', hangarId, annotationId: null })}>
            <MapPin size={17} />
          </IconButton>
          <ToolbarDivider />
          <IconButton label="Align left" disabled={n < 2} onClick={() => alignSelection('left')}>
            <AlignStartVertical size={17} />
          </IconButton>
          <IconButton label="Align centre (horizontal)" disabled={n < 2} onClick={() => alignSelection('centerH')}>
            <AlignCenterVertical size={17} />
          </IconButton>
          <IconButton label="Align right" disabled={n < 2} onClick={() => alignSelection('right')}>
            <AlignEndVertical size={17} />
          </IconButton>
          <IconButton label="Align top" disabled={n < 2} onClick={() => alignSelection('top')}>
            <AlignStartHorizontal size={17} />
          </IconButton>
          <IconButton label="Align middle (vertical)" disabled={n < 2} onClick={() => alignSelection('centerV')}>
            <AlignCenterHorizontal size={17} />
          </IconButton>
          <IconButton label="Align bottom" disabled={n < 2} onClick={() => alignSelection('bottom')}>
            <AlignEndHorizontal size={17} />
          </IconButton>
          <IconButton label="Distribute horizontally" disabled={n < 3} onClick={() => distributeSelection('h')}>
            <AlignHorizontalDistributeCenter size={17} />
          </IconButton>
          <IconButton label="Distribute vertically" disabled={n < 3} onClick={() => distributeSelection('v')}>
            <AlignVerticalDistributeCenter size={17} />
          </IconButton>
          <ToolbarDivider />
          <IconButton label="Duplicate" shortcut={`${MOD}+D`} disabled={n === 0} onClick={duplicateSelection}>
            <Copy size={17} />
          </IconButton>
          <IconButton label="Merge two adjacent stalls" disabled={!canMerge} onClick={mergeSelection}>
            <Combine size={17} />
          </IconButton>
          <IconButton label="Split top / bottom" disabled={!canSplitStall(single, 'h', grid)} onClick={() => splitSelection('h')}>
            <SquareSplitVertical size={17} />
          </IconButton>
          <IconButton label="Split left / right" disabled={!canSplitStall(single, 'v', grid)} onClick={() => splitSelection('v')}>
            <SquareSplitHorizontal size={17} />
          </IconButton>
          <IconButton
            label="Delete selection"
            shortcut="Delete"
            disabled={n === 0 && editor.annotationId === null}
            onClick={() => (editor.annotationId !== null ? deleteAnnotation(editor.annotationId) : deleteStalls(editor.stallIds))}
          >
            <Trash2 size={17} />
          </IconButton>
          <ToolbarDivider />
          <IconButton label="Undo" shortcut={`${MOD}+Z`} disabled={!canUndo} onClick={undo}>
            <Undo2 size={17} />
          </IconButton>
          <IconButton label="Redo" shortcut={`${MOD}+Shift+Z`} disabled={!canRedo} onClick={redo}>
            <Redo2 size={17} />
          </IconButton>
          <IconButton label="Show dimensions" shortcut="M" active={showDimensions} onClick={() => setShowDimensions(!showDimensions)}>
            <Ruler size={17} />
          </IconButton>
          <IconButton label="Pan tool" shortcut="hold Space" active={panMode} onClick={() => setPanMode((p) => !p)}>
            <Hand size={17} />
          </IconButton>
          <IconButton label="Keyboard shortcuts" shortcut="?" onClick={() => openModal({ kind: 'shortcuts' })}>
            <Keyboard size={17} />
          </IconButton>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1" aria-label={`${hangar.name} canvas`}>
          <EditorA11yList hangar={hangar} stalls={stalls} annotations={annotations} />
          <HangarEditorStage hangar={hangar} stalls={stalls} annotations={annotations} panMode={panMode} />
        </main>
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4" aria-label="Selection details">
          <SelectionPanel data={data} hangar={hangar} />
        </aside>
      </div>
    </div>
  );
}
