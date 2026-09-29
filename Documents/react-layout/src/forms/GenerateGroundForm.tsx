import { zodResolver } from '@hookform/resolvers/zod';
import { Wand2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Button, Modal } from '../components/ui';
import { autoFillHangarSize } from '../domain/layoutOps';
import type { GenerateGroundForm as GenerateGroundValues } from '../domain/types';
import { generateGroundLayout } from '../store/actions';
import { useLayoutStore } from '../store/layoutStore';
import { FormError, NumberField, SectionTitle, SelectField, TextField } from './fields';
import { generateGroundSchema } from './schemas';

function defaults(): GenerateGroundValues {
  const base: GenerateGroundValues = {
    exhibitionName: '',
    venueName: '',
    unit: 'meter',
    width: 60,
    height: 40,
    gridSize: 0.5,
    numHangars: 3,
    hangarPrefix: 'Hangar',
    hangarWidth: 20,
    hangarHeight: 14,
    gap: 2,
    startX: 2,
    startY: 2,
    hangarsPerRow: 2,
  };
  return { ...base, ...(autoFillHangarSize(base) ?? {}) };
}

export default function GenerateGroundForm({ onClose }: { onClose: () => void }) {
  const hasLayout = useLayoutStore((s) => s.data !== null);
  const form = useForm<GenerateGroundValues>({ resolver: zodResolver(generateGroundSchema), defaultValues: defaults(), mode: 'onTouched' });

  const autoFit = () => {
    const size = autoFillHangarSize(form.getValues());
    if (!size) {
      form.setError('root', { message: 'Hangars do not fit — enlarge the ground or reduce the gap/start offset.' });
      return;
    }
    form.clearErrors('root');
    form.setValue('hangarWidth', size.hangarWidth, { shouldValidate: true });
    form.setValue('hangarHeight', size.hangarHeight, { shouldValidate: true });
  };

  const onSubmit = form.handleSubmit((values) => {
    const error = generateGroundLayout(values);
    if (error) form.setError('root', { message: error });
    else onClose();
  });

  return (
    <Modal
      title="Generate Ground"
      description={hasLayout ? 'Replaces the current layout (you can undo with Ctrl+Z).' : 'Create the exhibition ground and auto-place hangars in a grid.'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="generate-ground-form">
            Generate
          </Button>
        </>
      }
    >
      <form id="generate-ground-form" onSubmit={onSubmit} noValidate>
        <FormError message={form.formState.errors.root?.message} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SectionTitle>Exhibition</SectionTitle>
          <TextField form={form} name="exhibitionName" label="Exhibition name" className="col-span-2" autoFocus />
          <TextField form={form} name="venueName" label="Venue" className="col-span-2" />
          <SectionTitle>Ground</SectionTitle>
          <SelectField
            form={form}
            name="unit"
            label="Unit"
            options={[
              { value: 'meter', label: 'Meters' },
              { value: 'feet', label: 'Feet' },
            ]}
          />
          <NumberField form={form} name="width" label="Width" />
          <NumberField form={form} name="height" label="Height" />
          <NumberField form={form} name="gridSize" label="Grid size" hint="Snap step" />
          <SectionTitle>Hangars</SectionTitle>
          <NumberField form={form} name="numHangars" label="Number of hangars" step={1} min={1} />
          <NumberField form={form} name="hangarsPerRow" label="Hangars per row" step={1} min={1} />
          <TextField form={form} name="hangarPrefix" label="Name prefix" className="col-span-2" hint='e.g. "Hangar" → Hangar A, Hangar B…' />
          <NumberField form={form} name="hangarWidth" label="Hangar width" />
          <NumberField form={form} name="hangarHeight" label="Hangar height" />
          <NumberField form={form} name="gap" label="Gap" />
          <div className="flex items-end">
            <Button size="sm" icon={<Wand2 size={14} />} onClick={autoFit} className="w-full">
              Auto-fit size
            </Button>
          </div>
          <NumberField form={form} name="startX" label="Start X" />
          <NumberField form={form} name="startY" label="Start Y" />
        </div>
      </form>
    </Modal>
  );
}
