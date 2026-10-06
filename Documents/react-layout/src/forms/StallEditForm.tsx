import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button, Modal } from '../components/ui';
import { CORNER_ORIENTATIONS, STALL_STATUSES, STALL_TYPES, STATUS_LABELS, UNIT_LABELS } from '../domain/constants';
import { findFreeSpot } from '../domain/geometry';
import { formatStallNo } from '../domain/layoutOps';
import { addStall, updateStall, type StallFormValues as StallEditValues } from '../store/actions';
import { OpenSidesPicker, sideStates } from '../panels/OpenSidesPicker';
import { useLayoutStore } from '../store/layoutStore';
import { FormError, NumberField, SectionTitle, SelectField, TextField } from './fields';
import { stallEditSchema } from './schemas';

type Props = { mode: 'edit'; stallId: number; onClose: () => void } | { mode: 'create'; hangarId: number; onClose: () => void };

export default function StallEditForm(props: Props) {
  const data = useLayoutStore((s) => s.data)!;
  const unit = UNIT_LABELS[data.ground.unit];
  const stall = props.mode === 'edit' ? data.stalls.find((s) => s.id === props.stallId) : undefined;
  const hangar = data.hangars.find((h) => h.id === (props.mode === 'edit' ? stall?.hangarId : props.hangarId));

  const defaultValues = useMemo<StallEditValues>(() => {
    if (stall) {
      return {
        stallNo: stall.stallNo,
        stallType: stall.stallType,
        width: stall.width,
        height: stall.height,
        x: stall.x,
        y: stall.y,
        basePrice: stall.basePrice,
        finalPrice: stall.finalPrice,
        status: stall.status,
        exhibitorName: stall.exhibitorName ?? '',
        cornerOrientation: stall.cornerOrientation ?? 'top-right',
        isBillable: stall.isBillable ?? true,
        openSides: stall.openSides ?? [],
      };
    }
    const inHangar = data.stalls.filter((s) => s.hangarId === hangar?.id);
    const prefix = hangar?.code.replace(/^H-/i, '') || 'S';
    const nos = new Set(inHangar.map((s) => s.stallNo));
    let n = 1;
    while (nos.has(formatStallNo(prefix, n))) n++;
    const spot = hangar ? findFreeSpot(3, 3, hangar, [...inHangar, ...data.annotations.filter((a) => a.hangarId === hangar.id)]) : { x: 0, y: 0 };
    return {
      stallNo: formatStallNo(prefix, n),
      stallType: 'Standard',
      width: 3,
      height: 3,
      x: spot.x,
      y: spot.y,
      basePrice: 25000,
      finalPrice: 25000,
      status: 'available',
      exhibitorName: '',
      cornerOrientation: 'top-right',
      isBillable: true,
      openSides: [],
    };
  }, []);

  // Third type param pinned explicitly: stallEditSchema's .superRefine() wrapper (schemas.ts)
  // stops @hookform/resolvers' zodResolver from inferring a transformed-output type that
  // collapses back to StallEditValues on its own, which otherwise leaks an unresolved
  // generic into every other `UseFormReturn<StallEditValues>`-typed prop (fields.tsx) this
  // form passes `form` into. Pre-existing library-version issue, unrelated to anything else
  // in this file — isolated to this one call.
  const form = useForm<StallEditValues, unknown, StallEditValues>({ resolver: zodResolver(stallEditSchema), defaultValues, mode: 'onTouched' });
  const status = useWatch({ control: form.control, name: 'status' });
  const stallType = useWatch({ control: form.control, name: 'stallType' });
  const openSides = useWatch({ control: form.control, name: 'openSides' }) ?? [];
  const toggleSide = (side: 'top' | 'right' | 'bottom' | 'left') => {
    const next = openSides.includes(side) ? openSides.filter((x) => x !== side) : [...openSides, side];
    form.setValue('openSides', next, { shouldDirty: true });
  };
  const needsExhibitor = status === 'reserved' || status === 'booked';

  if (!hangar || (props.mode === 'edit' && !stall)) return null;

  const onSubmit = form.handleSubmit((values) => {
    const errors = props.mode === 'edit' ? updateStall(props.stallId, values) : addStall(props.hangarId, values);
    if (!errors) return props.onClose();
    for (const [field, message] of Object.entries(errors)) form.setError(field as keyof StallEditValues, { message });
  });

  return (
    <Modal
      title={stall ? `Edit Stall ${stall.stallNo}` : `Add Stall to ${hangar.name}`}
      description={`Position is relative to ${hangar.name}'s origin (${hangar.width}×${hangar.height}${unit}).`}
      onClose={props.onClose}
      size="lg"
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="stall-form">
            {stall ? 'Save changes' : 'Add stall'}
          </Button>
        </>
      }
    >
      <form id="stall-form" onSubmit={onSubmit} noValidate>
        <FormError message={form.formState.errors.root?.message} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TextField form={form} name="stallNo" label="Stall no." autoFocus />
          <SelectField form={form} name="stallType" label="Type" options={STALL_TYPES.map((t) => ({ value: t, label: t }))} />
          {stallType === 'Corner' ? (
            <SelectField form={form} name="cornerOrientation" label="Cut corner" options={CORNER_ORIENTATIONS} className="col-span-2" />
          ) : (
            <div className="col-span-2" />
          )}
          <SectionTitle>Geometry ({unit})</SectionTitle>
          <NumberField form={form} name="x" label="X" />
          <NumberField form={form} name="y" label="Y" />
          <NumberField form={form} name="width" label="Width" />
          <NumberField form={form} name="height" label="Length" />
          <SectionTitle>Open sides</SectionTitle>
          <div className="col-span-full">
            <OpenSidesPicker state={sideStates([{ openSides }])} onToggle={toggleSide} caption="Select a side of the stall and mark it as an opening (drawn dotted) — e.g. the side facing the aisle." />
          </div>
          <SectionTitle>Pricing & booking</SectionTitle>
          <NumberField form={form} name="basePrice" label="Base price (₹)" step={500} min={0} />
          <NumberField form={form} name="finalPrice" label="Final price (₹)" step={500} min={0} />
          <SelectField
            form={form}
            name="status"
            label="Status"
            options={STALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            className="col-span-2"
          />
          <label className="col-span-2 inline-flex items-center gap-1.5 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-blue-600" {...form.register('isBillable')} />
            Billable
          </label>
          {needsExhibitor && <TextField form={form} name="exhibitorName" label="Exhibitor name" className="col-span-full" />}
        </div>
      </form>
    </Modal>
  );
}
