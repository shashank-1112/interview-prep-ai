import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { memo, useLayoutEffect, useRef } from 'react';
import { Group, Label, Rect, Shape, Tag, Text } from 'react-konva';
import { ANNOT_COLORS, annotationMeta, SEL_COLORS } from '../domain/constants';
import { formatLength, formatSize, parkingCapacity } from '../domain/site';
import type { LayoutAnnotation, LayoutUnit } from '../domain/types';
import { toPx } from './units';

type AnnotEvt<E extends Event = MouseEvent> = (e: KonvaEventObject<E>, a: LayoutAnnotation) => void;

export interface AnnotationShapeProps {
  annotation: LayoutAnnotation;
  selected?: boolean;
  draggable?: boolean;
  /** Layout unit — used for the length/size text on roads and parking. */
  unit?: LayoutUnit;
  /** Show the measured size on roads/parking. */
  showDimensions?: boolean;
  nodeRef?: (id: number, node: Konva.Group | null) => void;
  onPointerDown?: AnnotEvt;
  onClick?: AnnotEvt;
  onDblClick?: AnnotEvt;
  onDragMove?: AnnotEvt<DragEvent>;
  onDragEnd?: AnnotEvt<DragEvent>;
}

export const annotationNodeId = (id: number) => `annotation-${id}`;

const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif';

/**
 * Road name (+ measured size) on an asphalt-coloured pill so the centre line
 * never strikes through it. When space is short the NAME is shortened first,
 * so the length × width always stays readable.
 */
function RoadLabel({ name, suffix, cx, cy, fontSize, maxLength, vertical }: { name: string; suffix: string; cx: number; cy: number; fontSize: number; maxLength: number; vertical: boolean }) {
  const ref = useRef<Konva.Label>(null);
  useLayoutEffect(() => {
    const n = ref.current;
    if (!n) return;
    const t = n.getText();
    const compose = (label: string) => (suffix ? (label ? `${label}  ·  ${suffix}` : suffix) : label);
    t.width(undefined as unknown as number); // auto width → measure
    t.text(compose(name));
    // Shorten the name character by character until the pill fits (names are ≤ 40 chars).
    const chars = Array.from(name); // code points, so the emoji is never split
    for (let keep = chars.length - 1; t.width() > maxLength && keep >= 0; keep--) {
      t.text(compose(keep > 2 ? `${chars.slice(0, keep).join('').trimEnd()}…` : ''));
    }
    if (t.width() > maxLength) t.width(maxLength); // still too long: let ellipsis clip
    n.offsetX(n.width() / 2);
    n.offsetY(n.height() / 2);
  }, [name, suffix, fontSize, maxLength]);
  return (
    <Label ref={ref} x={cx} y={cy} rotation={vertical ? -90 : 0} listening={false}>
      <Tag fill="#334155" cornerRadius={fontSize * 0.35} />
      <Text text="" fontSize={fontSize} fontFamily={FONT} fontStyle="bold" fill="#ffffff" padding={fontSize * 0.35} wrap="none" ellipsis perfectDrawEnabled={false} />
    </Label>
  );
}

/** Asphalt strip with edge lines, a dashed centre line and the road name along its length. */
function RoadBody({ w, h, selected, label, sizeText }: { w: number; h: number; selected: boolean; label: string; sizeText: string | null }) {
  const horizontal = w >= h;
  const len = horizontal ? w : h;
  const depth = horizontal ? h : w;
  const fontSize = Math.min(depth * 0.3, toPx(1.2), len / 12);

  return (
    <>
      <Rect width={w} height={h} fill="#475569" stroke={selected ? SEL_COLORS.stroke : '#334155'} strokeWidth={toPx(selected ? 0.25 : 0.1)} perfectDrawEnabled={false} />
      <Shape
        listening={false}
        perfectDrawEnabled={false}
        sceneFunc={(ctx) => {
          const inset = Math.min(depth * 0.08, toPx(0.3));
          ctx.beginPath();
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = Math.max(depth * 0.02, 1);
          if (horizontal) {
            ctx.moveTo(0, inset);
            ctx.lineTo(w, inset);
            ctx.moveTo(0, h - inset);
            ctx.lineTo(w, h - inset);
          } else {
            ctx.moveTo(inset, 0);
            ctx.lineTo(inset, h);
            ctx.moveTo(w - inset, 0);
            ctx.lineTo(w - inset, h);
          }
          ctx.stroke();
          ctx.beginPath();
          ctx.setLineDash([toPx(1.5), toPx(1)]);
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = Math.max(depth * 0.03, 1);
          if (horizontal) {
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
          } else {
            ctx.moveTo(w / 2, 0);
            ctx.lineTo(w / 2, h);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }}
      />
      <RoadLabel name={`🛣️  ${label}`} suffix={sizeText ?? ''} cx={w / 2} cy={h / 2} fontSize={fontSize} maxLength={len * 0.92} vertical={!horizontal} />
    </>
  );
}

/** Parking lot: light surface with painted bays along both long edges and a P sign. */
function ParkingBody({ w, h, selected, unit }: { w: number; h: number; selected: boolean; unit: LayoutUnit }) {
  const colors = ANNOT_COLORS.parking;
  const perUnit = unit === 'feet' ? 3.28 : 1;
  const bayWidth = toPx(2.5 * perUnit);
  const horizontal = w >= h;
  const short = horizontal ? h : w;
  const bayDepth = Math.min(toPx(5 * perUnit), short * 0.35);
  return (
    <>
      <Rect
        width={w}
        height={h}
        fill={colors.fill}
        stroke={selected ? SEL_COLORS.stroke : colors.stroke}
        strokeWidth={toPx(selected ? 0.2 : 0.1)}
        cornerRadius={toPx(0.2)}
        perfectDrawEnabled={false}
      />
      <Shape
        listening={false}
        perfectDrawEnabled={false}
        sceneFunc={(ctx) => {
          ctx.beginPath();
          ctx.strokeStyle = '#7dd3fc';
          ctx.lineWidth = Math.max(toPx(0.08), 1);
          const long = horizontal ? w : h;
          for (let p = bayWidth; p < long - 1e-6; p += bayWidth) {
            if (horizontal) {
              ctx.moveTo(p, 0);
              ctx.lineTo(p, bayDepth);
              ctx.moveTo(p, h);
              ctx.lineTo(p, h - bayDepth);
            } else {
              ctx.moveTo(0, p);
              ctx.lineTo(bayDepth, p);
              ctx.moveTo(w, p);
              ctx.lineTo(w - bayDepth, p);
            }
          }
          ctx.stroke();
        }}
      />
    </>
  );
}

export const AnnotationShape = memo(function AnnotationShape({
  annotation: a,
  selected = false,
  draggable = false,
  unit = 'meter',
  showDimensions = false,
  nodeRef,
  onPointerDown,
  onClick,
  onDblClick,
  onDragMove,
  onDragEnd,
}: AnnotationShapeProps) {
  const w = toPx(a.width);
  const h = toPx(a.height);
  const colors = selected ? SEL_COLORS : ANNOT_COLORS[a.type];
  const minDim = Math.min(w, h);
  const meta = annotationMeta(a.type);
  const dashed = a.type === 'walking' || a.type === 'open-area';

  let body: React.ReactNode;
  if (a.type === 'road') {
    const long = Math.max(a.width, a.height);
    body = <RoadBody w={w} h={h} selected={selected} label={a.label} sizeText={showDimensions ? `${formatLength(long, unit)} × ${formatLength(Math.min(a.width, a.height), unit)}` : null} />;
  } else {
    const isParking = a.type === 'parking';
    const emojiSize = minDim * (isParking ? 0.34 : 0.4);
    const labelSize = minDim * (isParking ? 0.13 : 0.22);
    const sub = isParking
      ? `≈ ${parkingCapacity(a.width, a.height, unit)} cars${showDimensions ? ` · ${formatSize(a.width, a.height, unit)}` : ''}`
      : null;
    body = (
      <>
        {isParking ? (
          <ParkingBody w={w} h={h} selected={selected} unit={unit} />
        ) : (
          <Rect
            width={w}
            height={h}
            fill={colors.fill}
            stroke={colors.stroke}
            strokeWidth={toPx(selected ? 0.15 : 0.08)}
            dash={dashed ? [toPx(0.3), toPx(0.2)] : undefined}
            cornerRadius={toPx(0.2)}
            opacity={0.92}
            perfectDrawEnabled={false}
          />
        )}
        <Text text={meta.emoji} y={h / 2 - emojiSize * 0.95} width={w} align="center" fontSize={emojiSize} listening={false} perfectDrawEnabled={false} />
        <Text
          text={a.label}
          x={toPx(0.1)}
          y={h / 2 + emojiSize * 0.1}
          width={w - toPx(0.2)}
          align="center"
          fontSize={labelSize}
          fontStyle="bold"
          fill={isParking ? (selected ? SEL_COLORS.stroke : ANNOT_COLORS.parking.stroke) : colors.stroke}
          wrap="none"
          ellipsis
          listening={false}
          perfectDrawEnabled={false}
        />
        {sub && (
          <Text
            text={sub}
            x={toPx(0.1)}
            y={h / 2 + emojiSize * 0.1 + labelSize * 1.3}
            width={w - toPx(0.2)}
            align="center"
            fontSize={labelSize * 0.85}
            fill={ANNOT_COLORS.parking.stroke}
            wrap="none"
            ellipsis
            listening={false}
            perfectDrawEnabled={false}
          />
        )}
      </>
    );
  }

  return (
    <Group
      ref={nodeRef ? (n) => nodeRef(a.id, n) : undefined}
      id={annotationNodeId(a.id)}
      name={`annotation annotation-${a.type}`}
      x={toPx(a.x)}
      y={toPx(a.y)}
      draggable={draggable}
      onMouseDown={onPointerDown ? (e) => onPointerDown(e, a) : undefined}
      onClick={onClick ? (e) => onClick(e, a) : undefined}
      onTap={onClick ? (e) => onClick(e as unknown as KonvaEventObject<MouseEvent>, a) : undefined}
      onDblClick={onDblClick ? (e) => onDblClick(e, a) : undefined}
      onDragMove={onDragMove ? (e) => onDragMove(e, a) : undefined}
      onDragEnd={onDragEnd ? (e) => onDragEnd(e, a) : undefined}
    >
      {body}
    </Group>
  );
});
