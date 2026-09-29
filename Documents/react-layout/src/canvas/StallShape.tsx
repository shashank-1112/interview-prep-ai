import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { memo } from 'react';
import { Group, Line, Rect, Shape, Text } from 'react-konva';
import { SEL_COLORS, STALL_COLORS, STALL_TYPE_SYMBOLS, STATUS_SHORT_LABELS } from '../domain/constants';
import { CORNER_NOTCH_RATIO, cornerShapePoints } from '../domain/geometry';
import type { RectSide, Stall } from '../domain/types';
import { toPx } from './units';

type StallEvt<E extends Event = MouseEvent> = (e: KonvaEventObject<E>, stall: Stall) => void;

export interface StallShapeProps {
  stall: Stall;
  selected?: boolean;
  overlapping?: boolean;
  /** Ground-view preview: stall number + status only. */
  compact?: boolean;
  /** When set (e.g. "m"), label the stall's full-length sides with their measurements. */
  dimUnit?: string | undefined;
  draggable?: boolean;
  listening?: boolean;
  nodeRef?: (id: number, node: Konva.Group | null) => void;
  onPointerDown?: StallEvt;
  onClick?: StallEvt;
  onDblClick?: StallEvt;
  onDragStart?: StallEvt<DragEvent>;
  onDragMove?: StallEvt<DragEvent>;
  onDragEnd?: StallEvt<DragEvent>;
}

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/** Which bounding-box side an outline edge lies on (notch edges of Corner stalls lie on none). */
function edgeSide(x1: number, y1: number, x2: number, y2: number, w: number, h: number): RectSide | null {
  const e = 1e-6;
  if (Math.abs(y1 - y2) < e) {
    if (Math.abs(y1) < e) return 'top';
    if (Math.abs(y1 - h) < e) return 'bottom';
  } else if (Math.abs(x1 - x2) < e) {
    if (Math.abs(x1) < e) return 'left';
    if (Math.abs(x1 - w) < e) return 'right';
  }
  return null;
}

/** Outline drawn edge by edge: walls solid, open sides dotted. One Konva shape, no hit area. */
function StallOutline({
  points,
  w,
  h,
  open,
  stroke,
  strokeWidth,
  overlapping,
}: {
  points: number[];
  w: number;
  h: number;
  open: readonly RectSide[];
  stroke: string;
  strokeWidth: number;
  overlapping: boolean;
}) {
  return (
    <Shape
      name="stall-outline"
      width={w}
      height={h}
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        const n = points.length / 2;
        const draw = (wantOpen: boolean) => {
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const x1 = points[i * 2]!;
            const y1 = points[i * 2 + 1]!;
            const x2 = points[((i + 1) % n) * 2]!;
            const y2 = points[((i + 1) % n) * 2 + 1]!;
            const side = edgeSide(x1, y1, x2, y2, w, h);
            if ((side !== null && open.includes(side)) !== wantOpen) continue;
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
          }
          ctx.stroke();
        };
        ctx.strokeStyle = stroke;
        ctx.lineCap = 'round';
        ctx.lineWidth = strokeWidth;
        ctx.setLineDash(overlapping ? [toPx(0.2), toPx(0.12)] : []);
        draw(false);
        // Openings: dotted, same colour — reads as "no wall here".
        ctx.lineWidth = strokeWidth * 1.1;
        ctx.setLineDash([toPx(0.06), toPx(0.22)]);
        draw(true);
        ctx.setLineDash([]);
      }}
    />
  );
}

export const isCornerStall = (s: Pick<Stall, 'stallType'>) => s.stallType === 'Corner';

/** Konva node id for a stall — used by the transformer and e2e tests. */
export const stallNodeId = (id: number) => `stall-${id}`;

export const StallShape = memo(function StallShape({
  stall,
  selected = false,
  overlapping = false,
  compact = false,
  dimUnit,
  draggable = false,
  listening = true,
  nodeRef,
  onPointerDown,
  onClick,
  onDblClick,
  onDragStart,
  onDragMove,
  onDragEnd,
}: StallShapeProps) {
  const w = toPx(stall.width);
  const h = toPx(stall.height);
  const colors = selected ? SEL_COLORS : STALL_COLORS[stall.status];
  const stroke = overlapping ? '#ef4444' : colors.stroke;
  const strokeWidth = toPx(selected ? 0.15 : 0.07);
  const minDim = Math.min(w, h);
  const corner = isCornerStall(stall);
  const orientation = stall.cornerOrientation ?? 'top-right';
  const symbol = STALL_TYPE_SYMBOLS[stall.stallType] ?? '';

  const sub = compact ? STATUS_SHORT_LABELS[stall.status] : stall.exhibitorName || STATUS_SHORT_LABELS[stall.status];
  const showDims = !!dimUnit && !compact;
  const notchH = corner ? h * CORNER_NOTCH_RATIO : 0;
  const notchTop = corner && orientation.startsWith('top');
  const notchBottom = corner && orientation.startsWith('bottom');
  // Side-length labels go on the sides that run the full width / height (a Corner stall's notch shortens two sides).
  const widthEdge: 'top' | 'bottom' = notchTop ? 'bottom' : 'top';
  const heightEdge: 'left' | 'right' = corner && orientation.endsWith('left') ? 'right' : 'left';
  const dimSize = showDims ? minDim * 0.11 : 0;
  const dimPad = minDim * 0.03;
  const reserve = showDims ? dimSize + dimPad * 2 : 0;
  // Labels are centred in the band the notch doesn't cut into, clear of the dimension labels.
  const bandTop = (notchTop ? notchH : 0) + (widthEdge === 'top' ? reserve : 0);
  const bandBottom = h - (notchBottom ? notchH : 0) - (widthEdge === 'bottom' ? reserve : 0);
  const bandH = Math.max(bandBottom - bandTop, 1);
  const textX = heightEdge === 'left' ? reserve : 0;
  const textW = w - reserve;
  const bandMin = Math.min(textW, bandH);
  const mainSize = Math.min(minDim * 0.32, bandMin * 0.42);
  const subSize = Math.min(minDim * 0.24, bandMin * 0.3);
  const blockH = mainSize + subSize * 1.15;
  const top = bandTop + (bandH - blockH) / 2;
  // Type glyph sits in a top corner that isn't cut away.
  const symbolSize = Math.min(w, h) * 0.2;
  const symbolLeft = corner && orientation === 'top-right';
  const symbolY = notchTop ? notchH + toPx(0.08) : toPx(0.08) + (showDims && widthEdge === 'top' ? reserve * 0.6 : 0);

  const hasOpen = !!stall.openSides?.length;
  const outline = corner ? cornerShapePoints(0, 0, w, h, orientation) : [0, 0, w, 0, w, h, 0, h];
  const bodyProps = {
    fill: colors.fill,
    // With open sides the outline is drawn edge by edge (solid walls, dotted openings) below.
    stroke: hasOpen ? undefined : stroke,
    strokeWidth: hasOpen ? 0 : strokeWidth,
    dash: overlapping && !hasOpen ? [toPx(0.2), toPx(0.12)] : undefined,
    perfectDrawEnabled: false,
    shadowForStrokeEnabled: false,
  } as const;

  return (
    <Group
      ref={nodeRef ? (n) => nodeRef(stall.id, n) : undefined}
      id={stallNodeId(stall.id)}
      name="stall"
      x={toPx(stall.x)}
      y={toPx(stall.y)}
      draggable={draggable}
      listening={listening}
      onMouseDown={onPointerDown ? (e) => onPointerDown(e, stall) : undefined}
      onTouchStart={onPointerDown ? (e) => onPointerDown(e as unknown as KonvaEventObject<MouseEvent>, stall) : undefined}
      onClick={onClick ? (e) => onClick(e, stall) : undefined}
      onTap={onClick ? (e) => onClick(e as unknown as KonvaEventObject<MouseEvent>, stall) : undefined}
      onDblClick={onDblClick ? (e) => onDblClick(e, stall) : undefined}
      onDragStart={onDragStart ? (e) => onDragStart(e, stall) : undefined}
      onDragMove={onDragMove ? (e) => onDragMove(e, stall) : undefined}
      onDragEnd={onDragEnd ? (e) => onDragEnd(e, stall) : undefined}
    >
      {corner ? <Line points={outline} closed {...bodyProps} /> : <Rect width={w} height={h} {...bodyProps} />}
      {hasOpen && (
        <StallOutline
          points={outline}
          w={w}
          h={h}
          open={stall.openSides!}
          stroke={stroke}
          strokeWidth={strokeWidth}
          overlapping={overlapping}
        />
      )}
      <Text
        text={stall.stallNo}
        x={textX}
        y={top}
        width={textW}
        height={mainSize * 1.1}
        align="center"
        verticalAlign="middle"
        fontSize={mainSize}
        fontFamily={FONT}
        fontStyle="bold"
        fill={colors.text}
        wrap="none"
        ellipsis
        listening={false}
        perfectDrawEnabled={false}
      />
      <Text
        text={sub}
        x={textX + toPx(0.1)}
        y={top + mainSize * 1.15}
        width={textW - toPx(0.2)}
        height={subSize * 1.1}
        align="center"
        verticalAlign="middle"
        fontSize={subSize}
        fontFamily={FONT}
        fill={colors.text}
        wrap="none"
        ellipsis
        listening={false}
        perfectDrawEnabled={false}
      />
      {showDims && (
        <>
          <Text
            name="stall-dim"
            text={`${Math.round(stall.width * 100) / 100} ${dimUnit}`}
            x={0}
            y={widthEdge === 'top' ? dimPad : h - dimPad - dimSize}
            width={w}
            align="center"
            fontSize={dimSize}
            fontFamily={FONT}
            fill={colors.text}
            opacity={0.8}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Text
            name="stall-dim"
            text={`${Math.round(stall.height * 100) / 100} ${dimUnit}`}
            x={heightEdge === 'left' ? dimPad : w - dimPad - dimSize}
            y={h}
            width={h}
            rotation={-90}
            align="center"
            fontSize={dimSize}
            fontFamily={FONT}
            fill={colors.text}
            opacity={0.8}
            listening={false}
            perfectDrawEnabled={false}
          />
        </>
      )}
      {symbol && (
        <Text
          text={symbol}
          x={symbolLeft ? toPx(0.08) : w - symbolSize * 1.25}
          y={symbolY}
          fontSize={symbolSize}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  );
});
