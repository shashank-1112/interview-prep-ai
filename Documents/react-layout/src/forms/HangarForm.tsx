import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Modal } from '../components/ui';
import { UNIT_LABELS } from '../domain/constants';
import { findFreeSpot } from '../domain/geometry';
import { hangarLetter } from '../domain/layoutOps';
import { blocksHangars } from '../domain/site';
import type { AddHangarForm } from '../domain/types';
import { addHangar, updateHangar } from '../store/actions';
import { useLayoutStore } from '../store/layoutStore';
import { FormError, NumberField, TextField } from './fields';
import { hangarSchema } from './schemas';

/** Add (hangarId = null) or edit an existing hangar. Covers AddHangarForm and HangarEditForm. */
export default function HangarForm({ hangarId, onClose }: { hangarId: number | null; onClose: () => void }) {
  const data = useLayoutStore((s) => s.data)!;
  const editing = hangarId !== null ? data.hangars.find((h) => h.id === hangarId) : undefined;
  const unit = UNIT_LABELS[data.ground.unit];

  const defaultValues = useMemo<AddHangarForm>(() => {
    if (editing) {
      const { name, code, x, y, width, height } = editing;
      return { name, code, x, y, width, height };
    }
    const width = Math.min(20, data.ground.width);
    const height = Math.min(14, data.ground.height);
    const blockers = data.annotations.filter((a) => blocksHangars(a));
    const spot = findFreeSpot(width, height, data.ground, [...data.hangars, ...blockers], data.ground.gridSize);
    const letter = hangarLetter(data.hangars.length);
    return { name: `Hangar ${letter}`, code: `H-${letter}`, x: spot.x, y: spot.y, width, height };
  }, []);

  const form = useForm<AddHangarForm>({ resolver: zodResolver(hangarSchema), defaultValues, mode: 'onTouched' });

  const onSubmit = form.handleSubmit((values) => {
    const errors = editing ? updateHangar(editing.id, values) : addHangar(values);
    if (!errors) return onClose();
    for (const [field, message] of Object.entries(errors)) {
      form.setError(field as keyof AddHangarForm, { message });
    }
  });

  return (
    <Modal
      title={editing ? `Edit ${editing.name}` : 'Add Hangar'}
      description={`Position and size are in ${unit}, relative to the ground origin.`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="hangar-form">
            {editing ? 'Save changes' : 'Add hangar'}
          </Button>
        </>
      }
    >
      <form id="hangar-form" onSubmit={onSubmit} noValidate>
        <FormError message={form.formState.errors.root?.message} />
        <div className="grid grid-cols-2 gap-3">
          <TextField form={form} name="name" label="Name" autoFocus />
          <TextField form={form} name="code" label="Code" />
          <NumberField form={form} name="x" label={`X (${unit})`} />
          <NumberField form={form} name="y" label={`Y (${unit})`} />
          <NumberField form={form} name="width" label={`Width (${unit})`} />
          <NumberField form={form} name="height" label={`Length (${unit})`} />
        </div>
      </form>
    </Modal>
  );
}
