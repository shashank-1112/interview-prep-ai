import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Group, Layer, Rect, Stage, Transformer } from 'react-konva';
import { boundingBox, clamp, clean, findOverlappingIds, normalizeRect, rectsIntersect, snap } from '../domain/geometry';
import { UNIT_LABELS } from '../domain/constants';
import { minSizeFor } from '../domain/layoutOps';
import { formatLength } from '../domain/site';
import type { Hangar, LayoutAnnotation, Rect as RectT, Stall } from '../domain/types';
import { useElementSize } from '../hooks/useElementSize';
import { useZoomPan } from '../hooks/useZoomPan';
import { moveStallsBy, setAnnotationRect, setStallGeometry } from '../store/actions';
import { useLayoutStore } from '../store/layoutStore';
import { AnnotationShape } from './AnnotationShape';
import { DimensionLine } from './DimensionLine';
import { GridShape } from './GridShape';
import { hideSizeReadout, showSizeReadout, SizeReadout } from './SizeReadout';
import { makeBoundBoxFunc, pointerDistance, smartCache, TRANSFORMER_STYLE } from './konvaUtils';
import { StallShape } from './StallShape';
import { exposeStageForTests } from './testHooks';
import { toPx, toUnits } from './units';
import { registerViewport } from './viewportRegistry';
import { ZoomControls } from './ZoomControls';

interface StaticStallsProps {
  stalls: Stall[];
  overlapping: ReadonlySet<number>;
  zoom: number;
  dimUnit: string | undefined;
  onPointerDown: (e: KonvaEventObject<MouseEvent>, s: Stall) => void;
  onDblClick: (e: KonvaEventObject<MouseEvent>, s: Stall) => void;
}

/**
 * Every stall that is NOT selected lives here, inside one bitmap-cached group.
 * While the user drags/resizes the selection, only the (small) active layer
 * redraws; this layer is a single drawImage per frame regardless of stall count.
 * The cache keeps per-shape hit regions, so clicks still target individual stalls.
 */
const StaticStalls = memo(function StaticStalls({ stalls, overlapping, zoom, dimUnit, onPointerDown, onDblClick }: StaticStallsProps) {
  const ref = useRef<Konva.Group>(null);
  useEffect(() => {
    smartCache(ref.current, zoom);
    ref.current?.getLayer()?.batchDraw();
  }, [stalls, overlapping, zoom, dimUnit]);
  return (
    <Group ref={ref} name="static-stalls">
      {stalls.map((s) => (
        <StallShape
          key={s.id}
          stall={s}
          overlapping={overlapping.has(s.id)}
          dimUnit={dimUnit}
          onPointerDown={onPointerDown}
          onDblClick={onDblClick}
        />
      ))}
    </Group>
  );
});

interface DragContext {
  anchorId: number;
  start: Map<number, { x: number; y: number }>;
  box: RectT; // selection bbox in px at drag start
}

export interface HangarEditorStageProps {
  hangar: Hangar;
  stalls: Stall[];
  annotations: LayoutAnnotation[];
  panMode: boolean;
}

export function HangarEditorStage({ hangar, stalls, annotations, panMode }: HangarEditorStageProps) {
  const ground = useLayoutStore((s) => s.data!.ground);
  const showDimensions = useLayoutStore((s) => s.showDimensions);
  const selectedIds = useLayoutStore((s) => s.editor.stallIds);
  const selectedAnnotId = useLayoutStore((s) => s.editor.annotationId);
  const fitRequest = useLayoutStore((s) => s.fitRequest);
  const setEditorStalls = useLayoutStore((s) => s.setEditorStalls);
  const toggleEditorStall = useLayoutStore((s) => s.toggleEditorStall);
  const setEditorAnnotation = useLayoutStore((s) => s.setEditorAnnotation);
  const clearEditorSelection = useLayoutStore((s) => s.clearEditorSelection);
  const openModal = useLayoutStore((s) => s.openModal);

  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const stageRef = useRef<Konva.Stage>(null);
  const activeLayerRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const readoutRef = useRef<Konva.Label>(null);
  const marqueeRef = useRef<Konva.Rect>(null);
  const activeNodes = useRef(new Map<number, Konva.Group>());
  const annotNodes = useRef(new Map<number, Konva.Group>());
  const pendingDrag = useRef<number | null>(null);
  const pointerIsDown = useRef(false);
  const dragCtx = useRef<DragContext | null>(null);
  const marquee = useRef<{ start: { x: number; y: number }; screen: { x: number; y: number }; additive: boolean } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [zoom, setZoom] = useState(1);
  const zp = useZoomPan(stageRef, { onZoomSettled: setZoom, maxScale: 60 });

  const gridPx = toPx(ground.gridSize);
  const minPx = toPx(minSizeFor(ground));
  const hw = toPx(hangar.width);
  const hh = toPx(hangar.height);
  const panning = panMode || spaceHeld;
  const dimUnit = showDimensions ? UNIT_LABELS[ground.unit] : undefined;

  const overlapping = useMemo(() => findOverlappingIds(stalls), [stalls]);
  const [staticStalls, activeStalls] = useMemo(() => {
    const st: Stall[] = [];
    const ac: Stall[] = [];
    for (const s of stalls) (selectedIds.has(s.id) ? ac : st).push(s);
    return [st, ac];
  }, [stalls, selectedIds]);

  // ── Viewport ──
  const fitGround = useCallback(() => zp.fitRect({ x: 0, y: 0, width: hw, height: hh }, 40), [zp, hw, hh]);
  const fitContent = useCallback(() => {
    const box = boundingBox([...stalls, ...annotations]);
    if (!box) return fitGround();
    zp.fitRect({ x: toPx(box.x), y: toPx(box.y), width: toPx(box.width), height: toPx(box.height) }, 48);
  }, [zp, stalls, annotations, fitGround]);

  const didFit = useRef(false);
  useLayoutEffect(() => {
    if (size.width > 0 && !didFit.current) {
      didFit.current = true;
      fitGround();
    }
  }, [size.width, fitGround]);
  useEffect(() => {
    if (fitRequest?.scope !== 'editor') return;
    if (fitRequest.mode === 'ground') fitGround();
    else fitContent();
  }, [fitRequest]);
  useEffect(() => registerViewport('editor', { zoomIn: zp.zoomIn, zoomOut: zp.zoomOut, fitGround, fitContent }), [zp, fitGround, fitContent]);
  useEffect(() => exposeStageForTests('editor', stageRef.current), []);

  // Space-to-pan
  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target) && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // ── Node registry & programmatic drag hand-off ──
  const registerActive = useCallback((id: number, node: Konva.Group | null) => {
    if (!node) {
      activeNodes.current.delete(id);
      return;
    }
    activeNodes.current.set(id, node);
    // A stall pressed in the static layer re-mounts here once selected; carry
    // on the same press as a drag so select-and-drag is one gesture.
    if (pendingDrag.current === id && pointerIsDown.current) {
      pendingDrag.current = null;
      node.startDrag();
    }
  }, []);
  const registerAnnot = useCallback((id: number, node: Konva.Group | null) => {
    if (node) annotNodes.current.set(id, node);
    else annotNodes.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    let nodes: Konva.Node[] = [];
    if (selectedAnnotId !== null) {
      const n = annotNodes.current.get(selectedAnnotId);
      if (n) nodes = [n];
    } else {
      nodes = activeStalls.map((s) => activeNodes.current.get(s.id)).filter((n): n is Konva.Group => !!n);
    }
    const current = tr.nodes();
    const same = current.length === nodes.length && current.every((n, i) => n === nodes[i]);
    if (same) {
      tr.forceUpdate();
      tr.getLayer()?.batchDraw();
      return;
    }
    // Bound nodes changed mid-resize (Esc, Ctrl+A…): end the gesture as a cancel.
    if (tr.isTransforming()) {
      if (transformCtx.current) transformCtx.current.cancelled = true;
      tr.stopTransform();
    }
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [activeStalls, selectedAnnotId, annotations]);

  // ── Stall pointer handling ──
  const onStaticPointerDown = useCallback(
    (e: KonvaEventObject<MouseEvent>, s: Stall) => {
      if (e.evt.button !== 0 || panning) return;
      e.cancelBubble = true;
      pointerIsDown.current = true;
      if (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey) {
        toggleEditorStall(s.id);
        return;
      }
      pendingDrag.current = s.id;
      setEditorStalls([s.id]);
    },
    [panning, setEditorStalls, toggleEditorStall],
  );

  const onActivePointerDown = useCallback(
    (e: KonvaEventObject<MouseEvent>, s: Stall) => {
      if (e.evt.button !== 0 || panning) return;
      e.cancelBubble = true;
      pointerIsDown.current = true;
      if (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey) {
        e.currentTarget.stopDrag();
        toggleEditorStall(s.id);
      }
    },
    [panning, toggleEditorStall],
  );

  const onActiveClick = useCallback(
    (e: KonvaEventObject<MouseEvent>, s: Stall) => {
      if (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey) return;
      const ids = useLayoutStore.getState().editor.stallIds;
      if (ids.size > 1) setEditorStalls([s.id]);
    },
    [setEditorStalls],
  );

  const onStallDblClick = useCallback(
    (_e: KonvaEventObject<MouseEvent>, s: Stall) => openModal({ kind: 'editStall', stallId: s.id }),
    [openModal],
  );

  const onDragStart = useCallback((_e: KonvaEventObject<DragEvent>, s: Stall) => {
    const ids = useLayoutStore.getState().editor.stallIds;
    const start = new Map<number, { x: number; y: number }>();
    const rects: RectT[] = [];
    for (const id of ids) {
      const n = activeNodes.current.get(id);
      if (!n) continue;
      start.set(id, n.position());
      const st = useLayoutStore.getState().data?.stalls.find((x) => x.id === id);
      if (st) rects.push({ x: toPx(st.x), y: toPx(st.y), width: toPx(st.width), height: toPx(st.height) });
    }
    dragCtx.current = { anchorId: s.id, start, box: boundingBox(rects) ?? { x: 0, y: 0, width: 0, height: 0 } };
  }, []);

  const onDragMove = useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      const ctx = dragCtx.current;
      const anchorStart = ctx?.start.get(ctx.anchorId);
      if (!ctx || !anchorStart) return;
      const node = e.target;
      let dx = snap(node.x(), gridPx) - anchorStart.x;
      let dy = snap(node.y(), gridPx) - anchorStart.y;
      dx = clamp(dx, -ctx.box.x, hw - (ctx.box.x + ctx.box.width));
      dy = clamp(dy, -ctx.box.y, hh - (ctx.box.y + ctx.box.height));
      for (const [id, p] of ctx.start) {
        activeNodes.current.get(id)?.position({ x: p.x + dx, y: p.y + dy });
      }
    },
    [gridPx, hw, hh],
  );

  const onDragEnd = useCallback((e: KonvaEventObject<DragEvent>) => {
    const ctx = dragCtx.current;
    dragCtx.current = null;
    const anchorStart = ctx?.start.get(ctx.anchorId);
    if (!ctx || !anchorStart) return;
    const dx = toUnits(e.target.x() - anchorStart.x);
    const dy = toUnits(e.target.y() - anchorStart.y);
    moveStallsBy(new Set(ctx.start.keys()), dx, dy);
  }, []);

  // ── Annotations ──
  const onAnnotPointerDown = useCallback(
    (e: KonvaEventObject<MouseEvent>, a: LayoutAnnotation) => {
      if (panning) return;
      e.cancelBubble = true;
      setEditorAnnotation(a.id);
    },
    [panning, setEditorAnnotation],
  );
  const onAnnotDblClick = useCallback(
    (_e: KonvaEventObject<MouseEvent>, a: LayoutAnnotation) => openModal({ kind: 'annotation', hangarId: a.hangarId, annotationId: a.id }),
    [openModal],
  );
  const onAnnotDragMove = useCallback(
    (e: KonvaEventObject<DragEvent>, a: LayoutAnnotation) => {
      const n = e.target;
      const bx = toPx(a.x);
      const by = toPx(a.y);
      n.x(clamp(bx + snap(n.x() - bx, gridPx), 0, hw - toPx(a.width)));
      n.y(clamp(by + snap(n.y() - by, gridPx), 0, hh - toPx(a.height)));
    },
    [gridPx, hw, hh],
  );
  const onAnnotDragEnd = useCallback((e: KonvaEventObject<DragEvent>, a: LayoutAnnotation) => {
    const ok = setAnnotationRect(a.id, { x: toUnits(e.target.x()), y: toUnits(e.target.y()), width: a.width, height: a.height });
    if (!ok) e.target.position({ x: toPx(a.x), y: toPx(a.y) });
  }, []);

  // ── Transformer ──
  const boundBoxFunc = useMemo(
    () =>
      makeBoundBoxFunc(
        () => stageRef.current,
        () => ({ gridPx, minWidthPx: minPx, minHeightPx: minPx, bounds: { x: 0, y: 0, width: hw, height: hh } }),
      ),
    [gridPx, minPx, hw, hh],
  );

  const onTransform = useCallback(() => {
    const tr = trRef.current;
    if (tr) showSizeReadout(readoutRef.current, tr.nodes(), ground.unit);
  }, [ground.unit]);

  /** Nodes + selection a resize applies to, captured at transformstart. */
  const transformCtx = useRef<{ nodes: Konva.Node[]; stallIds: ReadonlySet<number>; annotationId: number | null; cancelled: boolean } | null>(null);

  const onTransformStart = useCallback(() => {
    const tr = trRef.current;
    const ed = useLayoutStore.getState().editor;
    transformCtx.current = tr ? { nodes: tr.nodes().slice(), stallIds: ed.stallIds, annotationId: ed.annotationId, cancelled: false } : null;
  }, []);

  const onTransformEnd = useCallback(() => {
    const ctx = transformCtx.current;
    transformCtx.current = null;
    const s = useLayoutStore.getState();
    hideSizeReadout(readoutRef.current);
    if (!ctx || !s.data) return;
    const data = s.data;
    const cancelled = ctx.cancelled || s.editor.stallIds !== ctx.stallIds || s.editor.annotationId !== ctx.annotationId;
    const g = data.ground.gridSize;
    const min = minSizeFor(data.ground);
    const stored = (node: Konva.Node): RectT | undefined => {
      const id = Number(node.id().replace(/^(stall|annotation)-/, ''));
      return node.id().startsWith('annotation-') ? data.annotations.find((a) => a.id === id) : data.stalls.find((x) => x.id === id);
    };
    const revert = (node: Konva.Node) => {
      const r = stored(node);
      node.scale({ x: 1, y: 1 });
      if (r) node.position({ x: toPx(r.x), y: toPx(r.y) });
    };
    if (cancelled) {
      ctx.nodes.forEach(revert);
      return;
    }
    /**
     * Read the node's new box and snap ONLY the edges that moved — the
     * Transformer already snapped the dragged edges, and untouched edges keep
     * their exact stored value (so a 3.6 m stall stays 3.6 m when only its
     * height changes). Returns null when nothing changed.
     */
    const fit = (node: Konva.Node, before: RectT): RectT | null => {
      const left0 = before.x;
      const top0 = before.y;
      const right0 = before.x + before.width;
      const bottom0 = before.y + before.height;
      const nx = toUnits(node.x());
      const ny = toUnits(node.y());
      const nr = toUnits(node.x() + toPx(before.width) * node.scaleX());
      const nb = toUnits(node.y() + toPx(before.height) * node.scaleY());
      const edge = (now: number, was: number) => (Math.abs(now - was) > 0.01 ? snap(now, g) : was);
      let left = edge(nx, left0);
      let top = edge(ny, top0);
      let right = edge(nr, right0);
      let bottom = edge(nb, bottom0);
      if (right - left < min) right = left + min;
      if (bottom - top < min) bottom = top + min;
      left = clamp(left, 0, hangar.width - min);
      top = clamp(top, 0, hangar.height - min);
      right = clamp(right, left + min, hangar.width);
      bottom = clamp(bottom, top + min, hangar.height);
      const r = { x: clean(left), y: clean(top), width: clean(right - left), height: clean(bottom - top) };
      node.scale({ x: 1, y: 1 });
      node.position({ x: toPx(r.x), y: toPx(r.y) });
      const same = r.x === before.x && r.y === before.y && r.width === before.width && r.height === before.height;
      return same ? null : r;
    };
    if (ctx.annotationId !== null) {
      const a = data.annotations.find((x) => x.id === ctx.annotationId);
      const node = ctx.nodes[0];
      if (!a || !node) return;
      const r = fit(node, a);
      if (r && !setAnnotationRect(a.id, r)) revert(node);
      return;
    }
    const rects = new Map<number, RectT>();
    for (const node of ctx.nodes) {
      const st = stored(node);
      if (!st || !node.id().startsWith('stall-')) continue;
      const r = fit(node, st);
      if (r) rects.set(Number(node.id().slice(6)), r);
    }
    if (rects.size) setStallGeometry(rects);
  }, [hangar.width, hangar.height]);

  // ── Marquee selection ──
  const endMarquee = useCallback(
    (commit: boolean) => {
      const m = marquee.current;
      const rect = marqueeRef.current;
      marquee.current = null;
      if (!m || !rect) return;
      const layer = activeLayerRef.current;
      const p = layer?.getRelativePointerPosition() ?? m.start;
      const screen = stageRef.current?.getPointerPosition() ?? m.screen;
      rect.visible(false);
      layer?.batchDraw();
      if (!commit) return;
      if (pointerDistance(screen, m.screen) < 4) {
        if (!m.additive) clearEditorSelection();
        return;
      }
      const box = normalizeRect(m.start.x, m.start.y, p.x, p.y);
      const hits = useLayoutStore
        .getState()
        .data!.stalls.filter((s) => s.hangarId === hangar.id)
        .filter((s) => rectsIntersect(box, { x: toPx(s.x), y: toPx(s.y), width: toPx(s.width), height: toPx(s.height) }))
        .map((s) => s.id);
      const base = m.additive ? [...useLayoutStore.getState().editor.stallIds] : [];
      setEditorStalls(new Set([...base, ...hits]));
    },
    [clearEditorSelection, setEditorStalls, hangar.id],
  );

  useEffect(() => {
    const up = () => {
      pointerIsDown.current = false;
      pendingDrag.current = null;
      if (marquee.current) endMarquee(true);
    };
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
  }, [endMarquee]);

  const onStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    pointerIsDown.current = true;
    if (panning || e.evt.button !== 0) return;
    const t = e.target;
    if (t !== t.getStage() && t.name() !== 'editor-bg') return;
    const layer = activeLayerRef.current;
    const p = layer?.getRelativePointerPosition();
    const screen = stageRef.current?.getPointerPosition();
    if (!p || !screen) return;
    marquee.current = { start: p, screen, additive: e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey };
    marqueeRef.current?.setAttrs({ x: p.x, y: p.y, width: 0, height: 0, visible: true });
  };

  const onStageMouseMove = () => {
    const m = marquee.current;
    const layer = activeLayerRef.current;
    if (!m || !layer) return;
    const p = layer.getRelativePointerPosition();
    if (!p) return;
    marqueeRef.current?.setAttrs(normalizeRect(m.start.x, m.start.y, p.x, p.y));
    layer.batchDraw();
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-slate-100"
      style={{ cursor: panning ? 'grab' : undefined }}
      data-testid="editor-canvas"
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        draggable={panning}
        onWheel={zp.onWheel}
        onMouseDown={onStageMouseDown}
        onTouchStart={onStageMouseDown as never}
        onMouseMove={onStageMouseMove}
        onTouchMove={onStageMouseMove}
      >
        <Layer>
          <Rect
            name="editor-bg"
            width={hw}
            height={hh}
            fill="#ffffff"
            stroke="#64748b"
            strokeWidth={toPx(0.1)}
            shadowColor="#0f172a"
            shadowOpacity={0.08}
            shadowBlur={16}
          />
          <GridShape width={hw} height={hh} step={gridPx} majorEvery={2 / ground.gridSize >= 2 ? Math.round(2 / ground.gridSize) : 10} zoom={zoom} emphasis />
          {showDimensions && (
            <>
              <DimensionLine x1={0} y1={0} x2={hw} y2={0} side="above" label={formatLength(hangar.width, ground.unit)} zoom={zoom} color="#1e293b" offset={14} />
              <DimensionLine x1={0} y1={0} x2={0} y2={hh} side="left" label={formatLength(hangar.height, ground.unit)} zoom={zoom} color="#1e293b" offset={14} />
            </>
          )}
        </Layer>
        <Layer>
          {annotations.map((a) => (
            <AnnotationShape
              key={a.id}
              annotation={a}
              selected={a.id === selectedAnnotId}
              draggable={!panning}
              unit={ground.unit}
              showDimensions={showDimensions}
              nodeRef={registerAnnot}
              onPointerDown={onAnnotPointerDown}
              onDblClick={onAnnotDblClick}
              onDragMove={onAnnotDragMove}
              onDragEnd={onAnnotDragEnd}
            />
          ))}
        </Layer>
        <Layer listening={!panning}>
          <StaticStalls
            stalls={staticStalls}
            overlapping={overlapping}
            zoom={zoom}
            dimUnit={dimUnit}
            onPointerDown={onStaticPointerDown}
            onDblClick={onStallDblClick}
          />
        </Layer>
        <Layer ref={activeLayerRef}>
          {activeStalls.map((s) => (
            <StallShape
              key={s.id}
              stall={s}
              selected
              overlapping={overlapping.has(s.id)}
              dimUnit={dimUnit}
              draggable={!panning}
              nodeRef={registerActive}
              onPointerDown={onActivePointerDown}
              onClick={onActiveClick}
              onDblClick={onStallDblClick}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
            />
          ))}
          <Transformer
            ref={trRef}
            {...TRANSFORMER_STYLE}
            enabledAnchors={[...TRANSFORMER_STYLE.enabledAnchors]}
            boundBoxFunc={boundBoxFunc}
            onTransformStart={onTransformStart}
            onTransform={onTransform}
            onTransformEnd={onTransformEnd}
          />
          <SizeReadout ref={readoutRef} />
          <Rect
            ref={marqueeRef}
            visible={false}
            listening={false}
            fill="rgba(37, 99, 235, 0.08)"
            stroke="#2563eb"
            strokeWidth={1}
            strokeScaleEnabled={false}
            dash={[4, 4]}
          />
        </Layer>
      </Stage>
      <ZoomControls
        scale={zp.scale}
        onZoomIn={zp.zoomIn}
        onZoomOut={zp.zoomOut}
        onFitGround={fitGround}
        onFitContent={fitContent}
        groundLabel="Fit to hangar"
      />
    </div>
  );
}
