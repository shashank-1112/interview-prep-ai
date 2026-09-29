import type Konva from 'konva';
import { memo, useLayoutEffect, useRef } from 'react';
import { Group, Label, Line, Tag, Text } from 'react-konva';

export interface DimensionLineProps {
  /** Start and end of the measured edge, in world px (must be axis-aligned). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Which way to offset the dimension line away from the edge. */
  side: 'above' | 'below' | 'left' | 'right';
  label: string;
  /** Current stage scale — keeps line offsets and text a constant size on screen. */
  zoom: number;
  color?: string;
  /** Screen px between the edge and the dimension line. */
  offset?: number;
  /** Hide when the edge is shorter than this many screen px. */
  minScreenLength?: number;
}

const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif';

/**
 * Architectural-style dimension: a line parallel to an edge with end ticks and
 * a centred length label. Everything is sized in screen px (divided by zoom),
 * so it reads the same at any zoom level. Non-interactive.
 */
export const DimensionLine = memo(function DimensionLine({
  x1,
  y1,
  x2,
  y2,
  side,
  label,
  zoom,
  color = '#475569',
  offset = 14,
  minScreenLength = 36,
}: DimensionLineProps) {
  const labelRef = useRef<Konva.Label>(null);
  const z = Math.max(zoom, 0.01);
  const horizontal = side === 'above' || side === 'below';
  const length = horizontal ? Math.abs(x2 - x1) : Math.abs(y2 - y1);

  useLayoutEffect(() => {
    const n = labelRef.current;
    if (!n) return;
    n.offsetX(n.width() / 2);
    n.offsetY(n.height() / 2);
  }, [label, zoom, length]);

  if (length * z < minScreenLength) return null;

  const off = offset / z;
  const tick = 4 / z;
  const dx = side === 'left' ? -off : side === 'right' ? off : 0;
  const dy = side === 'above' ? -off : side === 'below' ? off : 0;
  const ax = x1 + dx;
  const ay = y1 + dy;
  const bx = x2 + dx;
  const by = y2 + dy;
  const tickPts = (px: number, py: number) => (horizontal ? [px, py - tick, px, py + tick] : [px - tick, py, px + tick, py]);
  // Short extension lines from the object edge to the dimension line.
  const ext = (px: number, py: number) => [px, py, px + dx * 1.15, py + dy * 1.15];

  return (
    <Group listening={false} name="dimension">
      <Line points={ext(x1, y1)} stroke={color} strokeWidth={1} strokeScaleEnabled={false} opacity={0.45} perfectDrawEnabled={false} />
      <Line points={ext(x2, y2)} stroke={color} strokeWidth={1} strokeScaleEnabled={false} opacity={0.45} perfectDrawEnabled={false} />
      <Line points={[ax, ay, bx, by]} stroke={color} strokeWidth={1} strokeScaleEnabled={false} perfectDrawEnabled={false} />
      <Line points={tickPts(ax, ay)} stroke={color} strokeWidth={1.5} strokeScaleEnabled={false} perfectDrawEnabled={false} />
      <Line points={tickPts(bx, by)} stroke={color} strokeWidth={1.5} strokeScaleEnabled={false} perfectDrawEnabled={false} />
      <Label ref={labelRef} x={(ax + bx) / 2} y={(ay + by) / 2} scaleX={1 / z} scaleY={1 / z} rotation={horizontal ? 0 : -90}>
        <Tag fill="#ffffff" stroke={color} strokeWidth={0.75} cornerRadius={3} opacity={0.95} />
        <Text text={label} fontSize={11} fontFamily={FONT} fontStyle="600" fill={color} padding={3} />
      </Label>
    </Group>
  );
});
