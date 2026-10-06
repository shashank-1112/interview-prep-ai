import { memo, useMemo } from 'react';
import { annotationMeta, STATUS_LABELS } from '../domain/constants';
import { formatSize, groundLocation, inferSide, sideLabel, visibleAnnotations } from '../domain/site';
import type { ExhibitionGround, Hangar, LayoutAnnotation, Stall, StallLayoutData } from '../domain/types';
import { useLayoutStore } from '../store/layoutStore';

export function stallAriaLabel(stall: Stall, hangar?: Hangar): string {
  return (
    `Stall ${stall.stallNo}, ${hangar?.name ?? ''}, ${stall.stallType}, ${STATUS_LABELS[stall.status]}` +
    (stall.exhibitorName ? `, ${stall.exhibitorName}` : '') +
    (stall.openSides?.length ? `, open on ${stall.openSides.join(' and ')}` : '')
  );
}

export function hangarAriaLabel(h: Hangar, stallCount: number): string {
  return `Hangar ${h.name}, code ${h.code}, ${h.width} by ${h.height}, ${stallCount} stalls`;
}

export function annotationAriaLabel(a: LayoutAnnotation, ground?: ExhibitionGround): string {
  let where = '';
  if (ground && a.hangarId === null) {
    const loc = groundLocation(a, ground);
    const side = loc === 'outside' ? inferSide(a, ground) : null;
    where = loc === 'outside' ? `, outside the ground${side ? ` beside the ${sideLabel(side).toLowerCase()} side` : ''}` : ', inside the ground';
  }
  const size = ground ? `, ${formatSize(a.width, a.height, ground.unit)}` : '';
  return `${annotationMeta(a.type).label}: ${a.label}${where}${size}`;
}

const listClass =
  'sr-only focus-within:not-sr-only focus-within:absolute focus-within:left-3 focus-within:top-3 focus-within:z-20 ' +
  'focus-within:max-h-[60%] focus-within:w-72 focus-within:overflow-auto focus-within:rounded-lg focus-within:border ' +
  'focus-within:border-slate-200 focus-within:bg-white focus-within:p-2 focus-within:text-sm focus-within:shadow-lg';
const itemClass = 'block w-full rounded px-2 py-1 text-left hover:bg-slate-100 aria-pressed:bg-blue-50 aria-pressed:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600';

/** Polite live region describing the current selection (canvas content is invisible to screen readers). */
export function SelectionAnnouncer({ data }: { data: StallLayoutData }) {
  const ground = useLayoutStore((s) => s.groundSelection);
  const editor = useLayoutStore((s) => s.editor);
  const message = useMemo(() => {
    const hangarOf = (id: number) => data.hangars.find((h) => h.id === id);
    if (editor.hangarId !== null) {
      if (editor.annotationId !== null) {
        const a = data.annotations.find((x) => x.id === editor.annotationId);
        return a ? `Selected ${annotationAriaLabel(a, data.ground)}` : '';
      }
      const ids = [...editor.stallIds];
      if (ids.length === 0) return `Hangar editor: ${hangarOf(editor.hangarId)?.name ?? ''}. Nothing selected.`;
      if (ids.length === 1) {
        const s = data.stalls.find((x) => x.id === ids[0]);
        return s ? `Selected ${stallAriaLabel(s, hangarOf(s.hangarId))}` : '';
      }
      return `${ids.length} stalls selected.`;
    }
    if (!ground) return '';
    if (ground.kind === 'hangar') {
      const h = hangarOf(ground.id);
      return h ? `Selected ${hangarAriaLabel(h, data.stalls.filter((s) => s.hangarId === h.id).length)}` : '';
    }
    if (ground.kind === 'stall') {
      const s = data.stalls.find((x) => x.id === ground.id);
      return s ? `Selected ${stallAriaLabel(s, hangarOf(s.hangarId))}` : '';
    }
    const a = data.annotations.find((x) => x.id === ground.id);
    return a ? `Selected ${annotationAriaLabel(a, data.ground)}` : '';
  }, [data, ground, editor]);
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="selection-announcer">
      {message}
    </div>
  );
}

/** Keyboard/screen-reader mirror of the ground canvas. */
export const GroundA11yList = memo(function GroundA11yList({ data }: { data: StallLayoutData }) {
  const sel = useLayoutStore((s) => s.groundSelection);
  const selectGround = useLayoutStore((s) => s.selectGround);
  const openEditor = useLayoutStore((s) => s.openEditor);
  const showSafetyMarkers = useLayoutStore((s) => s.showSafetyMarkers);
  const byHangar = useMemo(() => {
    const m = new Map<number, Stall[]>();
    for (const s of data.stalls) (m.get(s.hangarId) ?? m.set(s.hangarId, []).get(s.hangarId)!).push(s);
    return m;
  }, [data.stalls]);
  // Mirrors what's actually drawn (see canvas/GroundStage.tsx) — a hidden
  // safety marker shouldn't be announced/reachable via this list either.
  const annots = useMemo(() => visibleAnnotations(data.annotations, showSafetyMarkers), [data.annotations, showSafetyMarkers]);
  return (
    <nav className={listClass} aria-label="Layout objects">
      <p className="px-2 pb-1 text-xs font-semibold text-slate-500">Layout objects — Enter selects, Enter again on a hangar opens it</p>
      <ul>
        {data.hangars.map((h) => {
          const stalls = byHangar.get(h.id) ?? [];
          const pressed = sel?.kind === 'hangar' && sel.id === h.id;
          return (
            <li key={h.id}>
              <button
                type="button"
                className={itemClass}
                aria-pressed={pressed}
                onClick={() => (pressed ? openEditor(h.id) : selectGround({ kind: 'hangar', id: h.id }))}
              >
                {hangarAriaLabel(h, stalls.length)}
              </button>
              {annots.some((a) => a.hangarId === h.id) && (
                <ul className="pl-3" aria-label={`Markers in ${h.name}`}>
                  {annots
                    .filter((a) => a.hangarId === h.id)
                    .map((a) => (
                      <li key={`a${a.id}`}>
                        <button
                          type="button"
                          className={itemClass}
                          onClick={() => {
                            openEditor(h.id);
                            useLayoutStore.getState().setEditorAnnotation(a.id);
                          }}
                        >
                          {annotationAriaLabel(a, data.ground)} (in {h.name})
                        </button>
                      </li>
                    ))}
                </ul>
              )}
              {stalls.length > 0 && (
                <ul className="pl-3" aria-label={`Stalls in ${h.name}`}>
                  {stalls.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={itemClass}
                        aria-pressed={sel?.kind === 'stall' && sel.id === s.id}
                        onClick={() => selectGround({ kind: 'stall', id: s.id })}
                      >
                        {stallAriaLabel(s, h)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {annots
          .filter((a) => a.hangarId === null)
          .map((a) => (
            <li key={`a${a.id}`}>
              <button
                type="button"
                className={itemClass}
                aria-pressed={sel?.kind === 'annotation' && sel.id === a.id}
                onClick={() => selectGround({ kind: 'annotation', id: a.id })}
              >
                {annotationAriaLabel(a, data.ground)}
              </button>
            </li>
          ))}
      </ul>
    </nav>
  );
});

/** Keyboard/screen-reader mirror of the hangar editor canvas. Shift/Ctrl+Enter adds to the selection. */
export const EditorA11yList = memo(function EditorA11yList({ hangar, stalls, annotations }: { hangar: Hangar; stalls: Stall[]; annotations: LayoutAnnotation[] }) {
  const editor = useLayoutStore((s) => s.editor);
  const setEditorStalls = useLayoutStore((s) => s.setEditorStalls);
  const toggleEditorStall = useLayoutStore((s) => s.toggleEditorStall);
  const setEditorAnnotation = useLayoutStore((s) => s.setEditorAnnotation);
  const showSafetyMarkers = useLayoutStore((s) => s.showSafetyMarkers);
  // Mirrors what's actually drawn (see canvas/HangarEditorStage.tsx).
  const visibleAnnots = useMemo(() => visibleAnnotations(annotations, showSafetyMarkers), [annotations, showSafetyMarkers]);
  return (
    <nav className={listClass} aria-label={`Objects in ${hangar.name}`}>
      <p className="px-2 pb-1 text-xs font-semibold text-slate-500">Enter selects · Shift+Enter adds to selection · arrows nudge</p>
      <ul>
        {stalls.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={itemClass}
              aria-pressed={editor.stallIds.has(s.id)}
              onClick={(e) => (e.shiftKey || e.ctrlKey || e.metaKey ? toggleEditorStall(s.id) : setEditorStalls([s.id]))}
            >
              {stallAriaLabel(s, hangar)}
            </button>
          </li>
        ))}
        {visibleAnnots.map((a) => (
          <li key={`a${a.id}`}>
            <button type="button" className={itemClass} aria-pressed={editor.annotationId === a.id} onClick={() => setEditorAnnotation(a.id)}>
              {annotationAriaLabel(a)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
});
