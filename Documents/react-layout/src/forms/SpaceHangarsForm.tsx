import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button, cx, Modal } from '../components/ui';
import { UNIT_LABELS } from '../domain/constants';
import { boundingBox } from '../domain/geometry';
import { currentHangarSpacing, hangarRows, respacedHangars, spaceHangars, type HangarSpacing } from '../domain/layoutOps';
import { isInsideGround } from '../domain/site';
import { spaceAllHangars } from '../store/actions';
import { useLayoutStore } from '../store/layoutStore';
import { FormError, NumberField } from './fields';
import { hangarSpacingSchema } from './schemas';

/** Set one gap between hangars side by side and one between rows, keeping rows and order. */
export default function SpaceHangarsForm({ onClose }: { onClose: () => void }) {
  const data = useLayoutStore((s) => s.data)!;
  const g = data.ground;
  const unit = UNIT_LABELS[g.unit];
  const current = useMemo(() => currentHangarSpacing(data.hangars), []);
  const rowCount = useMemo(() => hangarRows(data.hangars).length, []);

  const form = useForm<HangarSpacing>({
    resolver: zodResolver(hangarSpacingSchema),
    defaultValues: { gapX: current.gapX ?? 2, gapY: current.gapY ?? 2 },
    mode: 'onChange',
  });
  const v = useWatch({ control: form.control }) as HangarSpacing;
  const valid = Number.isFinite(v.gapX) && Number.isFinite(v.gapY) && v.gapX >= 0 && v.gapY >= 0;
  const preview = useMemo(() => (valid ? respacedHangars(data.hangars, v) : data.hangars), [valid, v.gapX, v.gapY, data.hangars]);
  const check = useMemo(() => (valid ? spaceHangars(data, v) : null), [valid, v.gapX, v.gapY, data]);
  const moved = preview.filter((h, i) => h.x !== data.hangars[i]!.x || h.y !== data.hangars[i]!.y).length;
  const refused = check !== null && !check.ok;

  const box = boundingBox([{ x: 0, y: 0, width: g.width, height: g.height }, ...preview])!;
  const pad = Math.max(box.width, box.height) * 0.03;

  const onSubmit = form.handleSubmit((values) => {
    const err = spaceAllHangars(values);
    if (!err) return onClose();
    form.setError(err.field ?? 'root', { message: err.error });
  });

  return (
    <Modal
      title="Space Hangars"
      description="Hangars keep their rows and order. The first hangar in each row and the top row stay put; the rest slide to the new gaps, taking their stalls with them."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="space-hangars-form" disabled={!valid || refused}>
            Apply spacing
          </Button>
        </>
      }
    >
      <form id="space-hangars-form" onSubmit={onSubmit} noValidate>
        <FormError message={form.formState.errors.root?.message} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            form={form}
            name="gapX"
            label={`Gap between hangars side by side (${unit})`}
            min={0}
            step={g.gridSize}
            hint={current.gapX !== null ? `Now: ${current.gapX} ${unit}` : 'No hangars side by side yet'}
          />
          <NumberField
            form={form}
            name="gapY"
            label={`Gap between rows (${unit})`}
            min={0}
            step={g.gridSize}
            hint={rowCount > 1 && current.gapY !== null ? `Now: ${current.gapY} ${unit}` : 'Only one row of hangars'}
          />
        </div>
        <svg
          viewBox={`${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`}
          className="mt-3 h-56 w-full rounded-md border border-slate-200 bg-slate-50"
          role="img"
          aria-label="Preview of the new hangar spacing"
          data-testid="spacing-preview"
        >
          <rect x={0} y={0} width={g.width} height={g.height} fill="#ffffff" stroke="#64748b" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {data.hangars.map((h) => (
            <rect key={`was${h.id}`} x={h.x} y={h.y} width={h.width} height={h.height} fill="none" stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          ))}
          {preview.map((h) => {
            const off = !isInsideGround(h, g);
            return (
              <g key={h.id} data-off={off || undefined}>
                <rect x={h.x} y={h.y} width={h.width} height={h.height} fill={off ? '#fee2e2' : '#dbeafe'} fillOpacity={0.85} stroke={off ? '#dc2626' : '#2563eb'} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                <text x={h.x + h.width / 2} y={h.y + h.height / 2} fontSize={Math.min(h.width, h.height) * 0.22} fontWeight={600} textAnchor="middle" dominantBaseline="central" fill={off ? '#b91c1c' : '#1e3a8a'}>
                  {h.code}
                </text>
              </g>
            );
          })}
        </svg>
        <p className={cx('mt-1.5 text-xs', refused ? 'text-red-600' : 'text-slate-600')} aria-live="polite" data-testid="spacing-summary">
          {!valid
            ? ''
            : refused
              ? check.error
              : moved
                ? `${moved} hangar${moved === 1 ? '' : 's'} will move, with their stalls. Dashed = where they are now.`
                : 'No change — the hangars already have this spacing.'}
        </p>
      </form>
    </Modal>
  );
}
