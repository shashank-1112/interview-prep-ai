import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Group, Layer, Rect, Stage, Text, Transformer } from 'react-konva';
import { boundingBox, clamp, rectContainsPoint, rectsIntersect, snap } from '../domain/geometry';
import { hangarContentExtent, minSizeFor } from '../domain/layoutOps';
import { annotationDragBounds, formatLength, groundLocation, isOutsideGround, outsideReach, placementRule, siteBounds } from '../domain/site';
import type { Hangar, LayoutAnnotation, LayoutUnit, Stall, StallLayoutData } from '../domain/types';
import { useElementSize } from '../hooks/useElementSize';
import { useZoomPan } from '../hooks/useZoomPan';
import { setAnnotationRect, setHangarRect } from '../store/actions';
import { useLayoutStore, type GroundSelection } from '../store/layoutStore';
import { AnnotationShape } from './AnnotationShape';
import { DimensionLine } from './DimensionLine';
import { GridShape } from './GridShape';
import { hideSizeReadout, showSizeReadout, SizeReadout } from './SizeReadout';
import { makeBoundBoxFunc, smartCache, TRANSFORMER_STYLE } from './konvaUtils';
import { StallShape } from './StallShape';
import { toPx, toUnits } from './units';
import { registerViewport } from './viewportRegistry';
import { ZoomControls } from './ZoomControls';
import { exposeStageForTests } from './testHooks';

const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif';

// ── Hangar ───────────────────────────────────────────────────────────────────

interface HangarNodeProps {
  hangar: Hangar;
  stalls: Stall[];
  /** Hangar-scoped markers (counters, washrooms…) — drawn in the preview, not interactive here. */
  markers: LayoutAnnotation[];
  selected: boolean;
  selectedStallId: number | null;
  editMode: boolean;
  zoom: number;
  gridPx: number;
  groundPx: { width: number; height: number };
  showDimensions: boolean;
  /** Draw the width/height dimension inside the frame when a neighbour leaves no room outside. */
  dimsInside: { bottom: boolean; right: boolean };
  unit: LayoutUnit;
  registerFrame: (id: number, node: Konva.Rect | null) => void;
  onSelect: (sel: GroundSelection) => void;
  onOpen: (hangarId: number) => void;
}

/**
 * One hangar: frame + label + its stalls. The stalls are a non-interactive,
 * bitmap-cached group — at ground scale 500+ stalls cost one drawImage per
 * hangar, and dragging a hangar just moves that bitmap. Stall clicks are
 * resolved by hit-testing the stall rects in hangar-local coordinates.
 */
const HangarNode = memo(function HangarNode({
  hangar,
  stalls,
  markers,
  selected,
  selectedStallId,
  editMode,
  zoom,
  gridPx,
  groundPx,
  showDimensions,
  dimsInside,
  unit,
  registerFrame,
  onSelect,
  onOpen,
}: HangarNodeProps) {
  const previewRef = useRef<Konva.Group>(null);
  const w = toPx(hangar.width);
  const h = toPx(hangar.height);
  const labelSize = Math.min(w, h) * 0.07;

  useEffect(() => {
    smartCache(previewRef.current, zoom);
  }, [stalls, markers, selectedStallId, zoom, unit]);

  const handleClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return;
    if (!editMode) {
      const p = e.currentTarget.getRelativePointerPosition();
      if (p) {
        const ux = toUnits(p.x);
        const uy = toUnits(p.y);
        const hit = stalls.find((s) => rectContainsPoint(s, ux, uy));
        if (hit) {
          onSelect({ kind: 'stall', id: hit.id });
          return;
        }
      }
    }
    onSelect({ kind: 'hangar', id: hangar.id });
  };

  return (
    <Group
      id={`hangar-${hangar.id}`}
      name="hangar"
      x={toPx(hangar.x)}
      y={toPx(hangar.y)}
      draggable={editMode}
      onClick={handleClick}
      onTap={handleClick as never}
      onDblClick={() => onOpen(hangar.id)}
      onDblTap={() => onOpen(hangar.id)}
      onDragStart={() => onSelect({ kind: 'hangar', id: hangar.id })}
      onDragMove={(e) => {
        const n = e.target;
        n.x(clamp(snap(n.x(), gridPx), 0, groundPx.width - w));
        n.y(clamp(snap(n.y(), gridPx), 0, groundPx.height - h));
      }}
      onDragEnd={(e) => {
        const n = e.target;
        const ok = setHangarRect(hangar.id, { x: toUnits(n.x()), y: toUnits(n.y()), width: hangar.width, height: hangar.height });
        if (!ok) n.position({ x: toPx(hangar.x), y: toPx(hangar.y) });
      }}
      onMouseEnter={(e) => {
        const c = e.target.getStage()?.container();
        if (c) c.style.cursor = editMode ? 'move' : 'pointer';
      }}
      onMouseLeave={(e) => {
        const c = e.target.getStage()?.container();
        if (c) c.style.cursor = '';
      }}
    >
      <Rect
        ref={(n) => registerFrame(hangar.id, n)}
        name="hangar-frame"
        width={w}
        height={h}
        fill="#f8fafc"
        stroke={selected ? '#2563eb' : '#64748b'}
        strokeWidth={toPx(selected ? 0.2 : 0.1)}
        cornerRadius={toPx(0.15)}
        shadowColor="#0f172a"
        shadowOpacity={selected ? 0.18 : 0.08}
        shadowBlur={toPx(0.6)}
        shadowOffsetY={toPx(0.15)}
        perfectDrawEnabled={false}
      />
      <Group ref={previewRef} name="hangar-content" listening={false}>
        {markers.map((a) => (
          <AnnotationShape key={`m${a.id}`} annotation={a} unit={unit} />
        ))}
        {stalls.map((s) => (
          <StallShape key={s.id} stall={s} compact listening={false} selected={s.id === selectedStallId} />
        ))}
      </Group>
      <Text
        name="hangar-label"
        text={`${hangar.name}  ·  ${hangar.code}`}
        x={toPx(0.3)}
        y={-labelSize * 1.35}
        fontSize={labelSize}
        fontFamily={FONT}
        fontStyle="bold"
        fill={selected ? '#1d4ed8' : '#334155'}
        listening={false}
      />
      {showDimensions && (
        <Group name="hangar-dims" listening={false}>
          <DimensionLine x1={0} y1={h} x2={w} y2={h} side={dimsInside.bottom ? 'above' : 'below'} label={formatLength(hangar.width, unit)} zoom={zoom} offset={10} />
          <DimensionLine x1={w} y1={0} x2={w} y2={h} side={dimsInside.right ? 'left' : 'right'} label={formatLength(hangar.height, unit)} zoom={zoom} offset={10} />
        </Group>
      )}
    </Group>
  );
});

// ── Stage ────────────────────────────────────────────────────────────────────

const EMPTY_STALLS: Stall[] = [];
const NO_INSIDE = { bottom: false, right: false };
const EMPTY_MARKERS: LayoutAnnotation[] = [];

export function GroundStage({ data }: { data: StallLayoutData }) {
  const { ground, hangars, stalls, annotations } = data;
  const editMode = useLayoutStore((s) => s.editMode);
  const showDimensions = useLayoutStore((s) => s.showDimensions);
  const selection = useLayoutStore((s) => s.groundSelection);
  const fitRequest = useLayoutStore((s) => s.fitRequest);
  const selectGround = useLayoutStore((s) => s.selectGround);
  const openEditor = useLayoutStore((s) => s.openEditor);

  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const readoutRef = useRef<Konva.Label>(null);
  const frames = useRef(new Map<number, Konva.Rect>());
  const annotNodes = useRef(new Map<number, Konva.Group>());
  const [zoom, setZoom] = useState(1);
  const zp = useZoomPan(stageRef, { onZoomSettled: setZoom });

  const gridPx = toPx(ground.gridSize);
  const groundPx = useMemo(() => ({ width: toPx(ground.width), height: toPx(ground.height) }), [ground.width, ground.height]);
  const minPx = toPx(minSizeFor(ground));

  const stallsByHangar = useMemo(() => {
    const m = new Map<number, Stall[]>();
    for (const s of stalls) {
      let arr = m.get(s.hangarId);
      if (!arr) m.set(s.hangarId, (arr = []));
      arr.push(s);
    }
    return m;
  }, [stalls]);
  const groundAnnots = useMemo(() => annotations.filter((a) => a.hangarId === null), [annotations]);
  const markersByHangar = useMemo(() => {
    const m = new Map<number, LayoutAnnotation[]>();
    for (const a of annotations) {
      if (a.hangarId === null) continue;
      let arr = m.get(a.hangarId);
      if (!arr) m.set(a.hangarId, (arr = []));
      arr.push(a);
    }
    return m;
  }, [annotations]);
  const site = useMemo(() => siteBounds(ground, annotations), [ground, annotations]);
  const sitePx = useMemo(() => ({ x: toPx(site.x), y: toPx(site.y), width: toPx(site.width), height: toPx(site.height) }), [site]);
  /**
   * A hangar's width/height dimensions sit just outside its bottom/right edges
   * unless another hangar (or its name label) is within the ~30 screen px they need.
   */
  const hangarDimsInside = useMemo(() => {
    const band = toUnits(30 / Math.max(zoom, 0.01));
    const m = new Map<number, { bottom: boolean; right: boolean }>();
    for (const h of hangars) {
      const others = [
        ...hangars
          .filter((o) => o.id !== h.id)
          .map((o) => {
            const label = Math.min(o.width, o.height) * 0.07 * 1.5;
            return { x: o.x, y: o.y - label, width: o.width, height: o.height + label };
          }),
        // Roads, parking and markers at ground level would hide the dimension too.
        ...groundAnnots,
      ];
      const below = { x: h.x, y: h.y + h.height, width: h.width, height: band };
      const right = { x: h.x + h.width, y: h.y, width: band, height: h.height };
      m.set(h.id, { bottom: others.some((o) => rectsIntersect(below, o)), right: others.some((o) => rectsIntersect(right, o)) });
    }
    return m;
  }, [hangars, groundAnnots, zoom]);

  /**
   * Put the ground's own dimension lines on the side whose hugging roads /
   * parking / counters reach out least, just beyond that chain of items.
   */
  const groundDimSides = useMemo(() => {
    const z = Math.max(zoom, 0.01);
    const reach = outsideReach(groundAnnots, ground, toUnits(30 / z));
    const h = reach.top <= reach.bottom ? 'above' : 'below';
    const v = reach.left <= reach.right ? 'left' : 'right';
    return {
      h,
      v,
      hOffset: 16 + toPx(reach[h === 'above' ? 'top' : 'bottom']) * z,
      vOffset: 16 + toPx(reach[v === 'left' ? 'left' : 'right']) * z,
    } as const;
  }, [groundAnnots, ground, zoom]);

  // ── Viewport ──
  /** Fit the ground plus anything placed around it (roads, outside parking). */
  const fitGround = useCallback(() => {
    const box = boundingBox([{ x: 0, y: 0, width: ground.width, height: ground.height }, ...groundAnnots])!;
    zp.fitRect({ x: toPx(box.x), y: toPx(box.y), width: toPx(box.width), height: toPx(box.height) }, 48);
  }, [zp, ground.width, ground.height, groundAnnots]);
  const fitContent = useCallback(() => {
    const box = boundingBox([...hangars, ...groundAnnots]);
    if (!box) return fitGround();
    zp.fitRect({ x: toPx(box.x), y: toPx(box.y), width: toPx(box.width), height: toPx(box.height) }, 48);
  }, [zp, hangars, groundAnnots, fitGround]);

  const didInitialFit = useRef(false);
  useLayoutEffect(() => {
    if (size.width > 0 && !didInitialFit.current) {
      didInitialFit.current = true;
      fitGround();
    }
  }, [size.width, fitGround]);

  useEffect(() => {
    if (fitRequest?.scope !== 'ground') return;
    if (fitRequest.mode === 'ground') fitGround();
    else fitContent();
  }, [fitRequest]);

  useEffect(() => registerViewport('ground', { zoomIn: zp.zoomIn, zoomOut: zp.zoomOut, fitGround, fitContent }), [zp, fitGround, fitContent]);
  useEffect(() => exposeStageForTests('ground', stageRef.current), []);

  // ── Transformer binding ──
  const selectedHangar = selection?.kind === 'hangar' ? hangars.find((h) => h.id === selection.id) : undefined;
  const selectedAnnot = selection?.kind === 'annotation' ? groundAnnots.find((a) => a.id === selection.id) : undefined;

  /** What a resize in progress applies to — captured at transformstart so a selection change mid-drag can't retarget it. */
  const transformCtx = useRef<{ node: Konva.Node; selection: NonNullable<GroundSelection>; cancelled: boolean } | null>(null);

  useLayoutEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    let node: Konva.Node | undefined;
    if (editMode && selectedHangar) node = frames.current.get(selectedHangar.id);
    else if (editMode && selectedAnnot) node = annotNodes.current.get(selectedAnnot.id);
    const current = tr.nodes()[0];
    if (current === node) {
      tr.forceUpdate();
      tr.getLayer()?.batchDraw();
      return;
    }
    // The bound node changed mid-resize (Esc, E, clicking elsewhere): end the
    // gesture as a CANCEL so transformend reverts the old node while it's still bound.
    if (tr.isTransforming()) {
      if (transformCtx.current) transformCtx.current.cancelled = true;
      tr.stopTransform();
    }
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [editMode, selectedHangar, selectedAnnot]);

  const boundBoxFunc = useMemo(
    () =>
      makeBoundBoxFunc(
        () => stageRef.current,
        () => {
          const s = useLayoutStore.getState();
          const sel = s.groundSelection;
          let minW = minPx;
          let minH = minPx;
          if (sel?.kind === 'hangar' && s.data) {
            const ext = hangarContentExtent(s.data, sel.id);
            minW = Math.max(minW, toPx(ext.width));
            minH = Math.max(minH, toPx(ext.height));
          }
          const annot = sel?.kind === 'annotation' ? s.data?.annotations.find((a) => a.id === sel.id) : undefined;
          if (annot && s.data) {
            const b = annotationDragBounds(annot.type, s.data.ground, siteBounds(s.data.ground, s.data.annotations));
            const g = s.data.ground;
            const rule = placementRule(annot.type);
            return {
              gridPx,
              minWidthPx: minW,
              minHeightPx: minH,
              bounds: { x: toPx(b.x), y: toPx(b.y), width: toPx(b.width), height: toPx(b.height) },
              // Roads can't be stretched onto the ground; either-type items can't be stretched across its edge.
              reject: (box) => {
                const u = { x: toUnits(box.x), y: toUnits(box.y), width: toUnits(box.width), height: toUnits(box.height) };
                if (rule === 'outside') return !isOutsideGround(u, g);
                if (rule === 'either') return groundLocation(u, g) === 'straddling';
                return false;
              },
            };
          }
          return { gridPx, minWidthPx: minW, minHeightPx: minH, bounds: { x: 0, y: 0, ...groundPx } };
        },
      ),
    [gridPx, minPx, groundPx],
  );

  /** Keep the hangar frame unscaled while resizing so strokes/labels don't distort. */
  const onTransform = useCallback(() => {
    const node = trRef.current?.nodes()[0];
    if (!node) return;
    const unit = useLayoutStore.getState().data?.ground.unit ?? 'meter';
    if (node.name() !== 'hangar-frame') {
      showSizeReadout(readoutRef.current, [node], unit);
      return;
    }
    const rect = node as Konva.Rect;
    rect.width(rect.width() * rect.scaleX());
    rect.height(rect.height() * rect.scaleY());
    rect.scale({ x: 1, y: 1 });
    const group = rect.getParent();
    // Stalls are hangar-relative: preview them moving with a dragged left/top edge.
    group?.findOne('.hangar-content')?.position(rect.position());
    group?.findOne('.hangar-label')?.x(rect.x() + toPx(0.3));
    group?.findOne('.hangar-dims')?.visible(false);
    showSizeReadout(readoutRef.current, [rect], unit);
  }, []);

  const onTransformStart = useCallback(() => {
    const node = trRef.current?.nodes()[0];
    const sel = useLayoutStore.getState().groundSelection;
    transformCtx.current = node && sel ? { node, selection: sel, cancelled: false } : null;
  }, []);

  const onTransformEnd = useCallback(() => {
    const ctx = transformCtx.current;
    transformCtx.current = null;
    hideSizeReadout(readoutRef.current);
    if (!ctx) return;
    const { node, selection: sel } = ctx;
    const s = useLayoutStore.getState();
    // Cancelled if the user deselected / left edit mode before releasing: revert instead of committing.
    const cur = s.groundSelection;
    const cancelled = ctx.cancelled || !s.editMode || !cur || cur.kind !== sel.kind || cur.id !== sel.id;
    if (sel.kind === 'hangar' && node.name() === 'hangar-frame') {
      const rect = node as Konva.Rect;
      const group = rect.getParent()!;
      const hangar = s.data?.hangars.find((h) => h.id === sel.id);
      if (!hangar) return;
      const next = {
        x: toUnits(group.x() + rect.x()),
        y: toUnits(group.y() + rect.y()),
        width: toUnits(rect.width()),
        height: toUnits(rect.height()),
      };
      const ok = !cancelled && setHangarRect(hangar.id, next);
      const final = ok ? next : hangar;
      rect.position({ x: 0, y: 0 });
      rect.size({ width: toPx(final.width), height: toPx(final.height) });
      group.position({ x: toPx(final.x), y: toPx(final.y) });
      group.findOne('.hangar-content')?.position({ x: 0, y: 0 });
      group.findOne('.hangar-label')?.x(toPx(0.3));
      group.findOne('.hangar-dims')?.visible(true);
      trRef.current?.forceUpdate();
    } else if (sel.kind === 'annotation') {
      const a = s.data?.annotations.find((x) => x.id === sel.id);
      if (!a) return;
      const next = {
        x: toUnits(node.x()),
        y: toUnits(node.y()),
        width: toUnits(toPx(a.width) * node.scaleX()),
        height: toUnits(toPx(a.height) * node.scaleY()),
      };
      node.scale({ x: 1, y: 1 });
      const ok = !cancelled && setAnnotationRect(a.id, next);
      const final = ok ? next : a;
      node.position({ x: toPx(final.x), y: toPx(final.y) });
      trRef.current?.forceUpdate();
    }
  }, []);

  const registerFrame = useCallback((id: number, node: Konva.Rect | null) => {
    if (node) frames.current.set(id, node);
    else frames.current.delete(id);
  }, []);
  const registerAnnot = useCallback((id: number, node: Konva.Group | null) => {
    if (node) annotNodes.current.set(id, node);
    else annotNodes.current.delete(id);
  }, []);

  const onAnnotSelect = useCallback((_e: unknown, a: LayoutAnnotation) => selectGround({ kind: 'annotation', id: a.id }), [selectGround]);
  const onAnnotDragMove = useCallback(
    (e: KonvaEventObject<DragEvent>, a: LayoutAnnotation) => {
      const n = e.target;
      // Roads / parking / ticketing may roam the site; other markers stay on the ground.
      const b = annotationDragBounds(a.type, ground, site);
      // Snap the *offset* from the stored position, so an item flush against an
      // off-grid edge (e.g. a 3.6 m road) stays flush while sliding along it.
      const bx = toPx(a.x);
      const by = toPx(a.y);
      n.x(clamp(bx + snap(n.x() - bx, gridPx), toPx(b.x), toPx(b.x + b.width - a.width)));
      n.y(clamp(by + snap(n.y() - by, gridPx), toPx(b.y), toPx(b.y + b.height - a.height)));
    },
    [gridPx, ground, site],
  );
  const onAnnotDragEnd = useCallback((e: KonvaEventObject<DragEvent>, a: LayoutAnnotation) => {
    const ok = setAnnotationRect(a.id, { x: toUnits(e.target.x()), y: toUnits(e.target.y()), width: a.width, height: a.height });
    if (!ok) e.target.position({ x: toPx(a.x), y: toPx(a.y) });
  }, []);

  const onStageClick = (e: KonvaEventObject<MouseEvent>) => {
    const t = e.target;
    if (t === t.getStage() || t.name() === 'ground-bg' || t.name() === 'site-bg') selectGround(null);
  };

  const selectedStallId = selection?.kind === 'stall' ? selection.id : null;
  const selectedStallHangar = selectedStallId !== null ? stalls.find((s) => s.id === selectedStallId)?.hangarId : undefined;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-slate-100" data-testid="ground-canvas">
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        draggable
        onWheel={zp.onWheel}
        onClick={onStageClick}
        onTap={onStageClick as never}
        onDragStart={(e) => {
          if (e.target === e.target.getStage()) e.target.getStage()!.container().style.cursor = 'grabbing';
        }}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) e.target.getStage()!.container().style.cursor = '';
        }}
      >
        <Layer>
          <Rect
            name="site-bg"
            {...sitePx}
            fill="#eef2ea"
            stroke="#cbd5c0"
            strokeWidth={1}
            strokeScaleEnabled={false}
            dash={[6, 4]}
            dashEnabled
          />
          <Text
            text="Site surroundings — roads, outside parking and counters go here"
            x={sitePx.x + toPx(0.6)}
            y={sitePx.y + toPx(0.6)}
            fontSize={toPx(0.9)}
            fontFamily={FONT}
            fill="#94a3b8"
            listening={false}
          />
          <Rect
            name="ground-bg"
            width={groundPx.width}
            height={groundPx.height}
            fill="#ffffff"
            stroke="#94a3b8"
            strokeWidth={1}
            strokeScaleEnabled={false}
            shadowColor="#0f172a"
            shadowOpacity={0.06}
            shadowBlur={16}
          />
          <GridShape width={groundPx.width} height={groundPx.height} step={gridPx} zoom={zoom} emphasis={editMode} />
        </Layer>
        <Layer>
          {hangars.map((h) => (
            <HangarNode
              key={h.id}
              hangar={h}
              stalls={stallsByHangar.get(h.id) ?? EMPTY_STALLS}
              markers={markersByHangar.get(h.id) ?? EMPTY_MARKERS}
              selected={selectedHangar?.id === h.id}
              selectedStallId={selectedStallHangar === h.id ? selectedStallId : null}
              editMode={editMode}
              zoom={zoom}
              gridPx={gridPx}
              groundPx={groundPx}
              showDimensions={showDimensions}
              dimsInside={hangarDimsInside.get(h.id) ?? NO_INSIDE}
              unit={ground.unit}
              registerFrame={registerFrame}
              onSelect={selectGround}
              onOpen={openEditor}
            />
          ))}
          {groundAnnots.map((a) => (
            <AnnotationShape
              key={a.id}
              annotation={a}
              selected={selectedAnnot?.id === a.id}
              draggable={editMode}
              unit={ground.unit}
              showDimensions={showDimensions}
              nodeRef={registerAnnot}
              onClick={onAnnotSelect}
              onPointerDown={onAnnotSelect}
              onDragMove={onAnnotDragMove}
              onDragEnd={onAnnotDragEnd}
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
        </Layer>
        {showDimensions && (
          <Layer listening={false} name="ground-dimensions">
            {groundDimSides.h === 'above' ? (
              <DimensionLine x1={0} y1={0} x2={groundPx.width} y2={0} side="above" label={formatLength(ground.width, ground.unit)} zoom={zoom} color="#1e293b" offset={groundDimSides.hOffset} />
            ) : (
              <DimensionLine x1={0} y1={groundPx.height} x2={groundPx.width} y2={groundPx.height} side="below" label={formatLength(ground.width, ground.unit)} zoom={zoom} color="#1e293b" offset={groundDimSides.hOffset} />
            )}
            {groundDimSides.v === 'left' ? (
              <DimensionLine x1={0} y1={0} x2={0} y2={groundPx.height} side="left" label={formatLength(ground.height, ground.unit)} zoom={zoom} color="#1e293b" offset={groundDimSides.vOffset} />
            ) : (
              <DimensionLine x1={groundPx.width} y1={0} x2={groundPx.width} y2={groundPx.height} side="right" label={formatLength(ground.height, ground.unit)} zoom={zoom} color="#1e293b" offset={groundDimSides.vOffset} />
            )}
          </Layer>
        )}
        <Layer listening={false} name="readout">
          <SizeReadout ref={readoutRef} />
        </Layer>
      </Stage>
      <ZoomControls
        scale={zp.scale}
        onZoomIn={zp.zoomIn}
        onZoomOut={zp.zoomOut}
        onFitGround={fitGround}
        onFitContent={fitContent}
        groundLabel="Fit to site"
      />
    </div>
  );
}
