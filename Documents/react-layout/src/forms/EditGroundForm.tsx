import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Modal } from '../components/ui';
import { UNIT_LABELS } from '../domain/constants';
import { clean } from '../domain/geometry';
import type { GroundEdit } from '../domain/layoutOps';
import { isInsideGround } from '../domain/site';
import { updateGround } from '../store/actions';
import { useLayoutStore } from '../store/layoutStore';
import { FormError, NumberField } from './fields';
import { editGroundSchema } from './schemas';

/** Resize the ground / change its grid in place — hangars, stalls and markers are kept. */
export default function EditGroundForm({ onClose }: { onClose: () => void }) {
  const data = useLayoutStore((s) => s.data)!;
  const g = data.ground;
  const unit = UNIT_LABELS[g.unit];

  // Smallest size that keeps every hangar and inside-the-ground marker (they don't move).
  const minSize = useMemo(() => {
    const staying = [...data.hangars, ...data.annotations.filter((a) => a.hangarId === null && isInsideGround(a, g))];
    if (!staying.length) return null;
    return {
      width: clean(Math.max(...staying.map((r) => r.x + r.width))),
      height: clean(Math.max(...staying.map((r) => r.y + r.height))),
    };
  }, []);

  const form = useForm<GroundEdit>({
    resolver: zodResolver(editGroundSchema),
    defaultValues: { width: g.width, height: g.height, gridSize: g.gridSize },
    mode: 'onTouched',
  });

  const onSubmit = form.handleSubmit((values) => {
    const err = updateGround(values);
    if (!err) return onClose();
    form.setError(err.field ?? 'root', { message: err.error });
  });

  return (
    <Modal
      title="Edit Ground"
      description="Change the ground's size and grid. Hangars, stalls and markers are kept where they are; the top-left corner stays fixed."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="edit-ground-form">
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-ground-form" onSubmit={onSubmit} noValidate>
        <FormError message={form.formState.errors.root?.message} />
        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <dt className="text-slate-500">Exhibition</dt>
          <dd className="text-slate-900">{g.exhibitionName || '—'}</dd>
          <dt className="text-slate-500">Venue</dt>
          <dd className="text-slate-900">{g.venueName || '—'}</dd>
          <dt className="text-slate-500">Unit</dt>
          <dd className="text-slate-900">{unit}</dd>
        </dl>
        <div className="grid grid-cols-3 gap-3">
          <NumberField form={form} name="width" label={`Width (${unit})`} />
          <NumberField form={form} name="height" label={`Length (${unit})`} />
          <NumberField form={form} name="gridSize" label={`Grid size (${unit})`} hint="Snap step" />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {minSize
            ? `To keep every hangar and marker inside, the ground must be at least ${minSize.width} × ${minSize.height} ${unit}. `
            : ''}
          Roads, parking and counters outside the right or bottom edge, and gates on those edges, move with the edge. Exhibition and venue come
          from the exhibition record; the unit can't be changed here because every size and position would have to be converted.
        </p>
      </form>
    </Modal>
  );
}
