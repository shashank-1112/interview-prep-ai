import { memo } from 'react';
import { ANNOT_COLORS } from '../domain/constants';
import { rectsOverlap } from '../domain/geometry';
import type { PlannedStall } from '../domain/stallLayout';
import type { LayoutAnnotation, Rect, RectSide } from '../domain/types';

const EDGES: Array<[RectSide, (r: Rect) => [number, number, number, number]]> = [
  ['top', (r) => [r.x, r.y, r.x + r.width, r.y]],
  ['right', (r) => [r.x + r.width, r.y, r.x + r.width, r.y + r.height]],
  ['bottom', (r) => [r.x, r.y + r.height, r.x + r.width, r.y + r.height]],
  ['left', (r) => [r.x, r.y, r.x, r.y + r.height]],
];

/**
 * Scaled SVG preview of Generate Stalls: the hangar outline, existing stalls
 * (grey), markers, and the planned stalls with walls solid and openings dotted.
 * Planned stalls that would be skipped (overlap) are shown in red.
 */
export const LayoutPreview = memo(function LayoutPreview({
  hangar,
  planned,
  existing,
  annotations,
}: {
  hangar: { width: number; height: number; name: string };
  planned: readonly PlannedStall[];
  existing: readonly Rect[];
  annotations: readonly LayoutAnnotation[];
}) {
  const pad = Math.max(hangar.width, hangar.height) * 0.03;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${hangar.width + pad * 2} ${hangar.height + pad * 2}`}
      className="h-52 w-full rounded-md border border-slate-200 bg-slate-50"
      role="img"
      aria-label={`Preview of ${planned.length} stalls in ${hangar.name}`}
      data-testid="layout-preview"
    >
      <rect x={0} y={0} width={hangar.width} height={hangar.height} fill="#ffffff" stroke="#64748b" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {annotations.map((a) => (
        <rect key={`a${a.id}`} x={a.x} y={a.y} width={a.width} height={a.height} fill={ANNOT_COLORS[a.type].fill} stroke={ANNOT_COLORS[a.type].stroke} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {existing.map((r, i) => (
        <rect key={`e${i}`} x={r.x} y={r.y} width={r.width} height={r.height} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {planned.map((p, i) => {
        const skipped = existing.some((e) => rectsOverlap(p, e)) || annotations.some((a) => rectsOverlap(p, a));
        const color = skipped ? '#ef4444' : '#16a34a';
        return (
          <g key={i} data-open={p.openSides.join(' ')}>
            <rect x={p.x} y={p.y} width={p.width} height={p.height} fill={skipped ? '#fee2e2' : '#dcfce7'} />
            {EDGES.map(([side, pts]) => {
              const [x1, y1, x2, y2] = pts(p);
              const open = p.openSides.includes(side);
              return (
                <line
                  key={side}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth={open ? 1.6 : 1.2}
                  strokeDasharray={open ? '1 3' : undefined}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
});
