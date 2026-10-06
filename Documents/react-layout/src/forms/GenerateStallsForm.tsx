import { zodResolver } from '@hookform/resolvers/zod';
import { Grid3x3, LayoutTemplate, Wand2 } from 'lucide-react';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Button, cx, formatPrice, Modal } from '../components/ui';
import { CORNER_ORIENTATIONS, STALL_SIZE_PRESETS, STALL_TYPES, UNIT_LABELS } from '../domain/constants';
import { rectsOverlap, snap } from '../domain/geometry';
import { stallFitEstimate } from '../domain/layoutOps';
import { describePlan, planStallLayout, type GenerateStallsInput, type StallPattern } from '../domain/stallLayout';
import type { RectSide } from '../domain/types';
import { OpenSidesPicker, sideStates } from '../panels/OpenSidesPicker';
import { generateStallsInHangar } from '../store/actions';
import { useLayoutStore } from '../store/layoutStore';
import { FormError, NumberField, SectionTitle, SelectField, TextField } from './fields';
import { LayoutPreview } from './LayoutPreview';
import { generateStallsSchema } from './schemas';

type Values = GenerateStallsInput;

const WALLS: { value: RectSide; label: string }[] = [
  { value: 'top', label: 'Top wall' },
  { value: 'right', label: 'Right wall' },
  { value: 'bottom', label: 'Bottom wall' },
  { value: 'left', label: 'Left wall' },
];

const PATTERNS: { value: StallPattern; title: string; body: string; icon: React.ReactNode }[] = [
  {
    value: 'perimeter',
    title: 'Along walls + islands',
    body: 'Stalls attached to the hangar walls, back-to-back islands in the centre, aisles between. Aisle sides are left open.',
    icon: <LayoutTemplate size={18} />,
  },
  {
    value: 'grid',
    title: 'Grid',
    body: 'Rows × columns with gaps, starting from a corner.',
    icon: <Grid3x3 size={18} />,
  },
];

export default function GenerateStallsForm({ hangarId, onClose }: { hangarId: number | null; onClose: () => void }) {
  const data = useLayoutStore((s) => s.data)!;
  const unit = UNIT_LABELS[data.ground.unit];
  const feet = data.ground.unit === 'feet';

  const defaultValues = useMemo<Values>(() => {
    const hangar = data.hangars.find((h) => h.id === hangarId) ?? data.hangars[0];
    const prefix = hangar?.code.replace(/^H-/i, '') || 'A';
    return {
      hangarId: hangar?.id ?? 0,
      pattern: 'perimeter',
      rows: 3,
      columns: 4,
      prefix,
      startNumber: 1,
      sizePreset: '3×3',
      stallWidth: 3,
      stallHeight: 3,
      gapX: 0.5,
      gapY: 0.5,
      startX: 1,
      startY: 1,
      stallType: 'Standard',
      basePrice: 25000,
      cornerOrientation: 'top-right',
      isBillable: true,
      walls: ['top', 'right', 'left'],
      wallGap: 0,
      aisle: snap(feet ? 10 : 3, data.ground.gridSize),
      islands: true,
      openSides: [],
    };
  }, []);

  const form = useForm<Values>({ resolver: zodResolver(generateStallsSchema), defaultValues, mode: 'onTouched' });
  const v = useWatch({ control: form.control }) as Values;
  const perimeter = v.pattern === 'perimeter';
  const selectedHangar = data.hangars.find((h) => h.id === Number(v.hangarId));

  const existing = useMemo(() => data.stalls.filter((s) => s.hangarId === selectedHangar?.id), [data.stalls, selectedHangar?.id]);
  const markers = useMemo(() => data.annotations.filter((a) => a.hangarId === selectedHangar?.id), [data.annotations, selectedHangar?.id]);
  const plan = useMemo(
    () =>
      selectedHangar
        ? planStallLayout(selectedHangar, { ...v, rows: Number(v.rows) || 0, columns: Number(v.columns) || 0 }, data.ground.gridSize, existing)
        : null,
    [selectedHangar, v, data.ground.gridSize, existing],
  );
  const placeable = plan ? plan.stalls.filter((p) => !existing.some((e) => rectsOverlap(p, e)) && !markers.some((m) => rectsOverlap(p, m))).length : 0;
  const skipped = (plan?.stalls.length ?? 0) - placeable;

  // Grid-only helpers.
  const fit = stallFitEstimate(selectedHangar, v);
  const requested = (Number(v.rows) || 0) * (Number(v.columns) || 0);
  const exceeded = !perimeter && requested > fit.total;

  const onPresetChange = (label: string) => {
    const preset = STALL_SIZE_PRESETS.find((p) => p.label === label);
    if (preset && preset.label !== 'Custom') {
      form.setValue('stallWidth', preset.width, { shouldValidate: true });
      form.setValue('stallHeight', preset.height, { shouldValidate: true });
    }
  };
  const onSizeEdited = () => {
    const { stallWidth, stallHeight } = form.getValues();
    const match = STALL_SIZE_PRESETS.find((p) => p.width === stallWidth && p.height === stallHeight);
    form.setValue('sizePreset', match?.label ?? 'Custom');
  };
  const applyMaxFit = () => {
    if (fit.total <= 0) {
      toast.warning('No stalls fit with the current size/gap settings — try a smaller stall size or gap.');
      return;
    }
    form.setValue('rows', fit.rows, { shouldValidate: true });
    form.setValue('columns', fit.cols, { shouldValidate: true });
  };
  const toggleWall = (side: RectSide) => {
    const cur = form.getValues('walls');
    form.setValue('walls', cur.includes(side) ? cur.filter((w) => w !== side) : [...cur, side], { shouldValidate: true });
  };
  const toggleGridSide = (side: RectSide) => {
    const cur = form.getValues('openSides');
    form.setValue('openSides', cur.includes(side) ? cur.filter((w) => w !== side) : [...cur, side]);
  };

  const onSubmit = form.handleSubmit((values) => {
    const err = generateStallsInHangar(values);
    if (!err) return onClose();
    if (err.field) form.setError(err.field as keyof Values, { message: err.error });
    else form.setError('root', { message: err.error });
  });

  return (
    <Modal
      title="Generate Stalls"
      description="Fill a hangar with stalls in one go. Existing stalls and markers are kept; anything that would overlap them is skipped."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="generate-stalls-form" disabled={placeable === 0}>
            Generate {placeable} stall{placeable === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <form id="generate-stalls-form" onSubmit={onSubmit} noValidate>
        <FormError message={form.formState.errors.root?.message} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SelectField
            form={form}
            name="hangarId"
            label="Hangar"
            asNumber
            className="col-span-2"
            options={data.hangars.map((h) => ({ value: h.id, label: `${h.name} (${h.width}×${h.height}${unit})` }))}
          />
          <TextField
            form={form}
            name="prefix"
            label="Prefix"
            hint={`${(v.prefix || 'A').trim()} → ${(v.prefix || 'A').trim()}-${String(Number(v.startNumber) || 0).padStart(2, '0')}…`}
          />
          <NumberField form={form} name="startNumber" label="Start number" step={1} min={0} />

          <fieldset className="col-span-full">
            <legend className="mb-1.5 text-xs font-medium text-slate-600">Layout</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PATTERNS.map((p) => (
                <label
                  key={p.value}
                  className={cx(
                    'flex cursor-pointer gap-2.5 rounded-md border p-2.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-600',
                    v.pattern === p.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <input type="radio" value={p.value} className="sr-only" {...form.register('pattern')} />
                  <span className={cx('mt-0.5', v.pattern === p.value ? 'text-blue-700' : 'text-slate-500')} aria-hidden>
                    {p.icon}
                  </span>
                  <span>
                    <span className="block font-medium text-slate-900">{p.title}</span>
                    <span className="block text-xs text-slate-500">{p.body}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {selectedHangar && plan && (
            <div className="col-span-full space-y-1.5">
              <LayoutPreview hangar={selectedHangar} planned={plan.stalls} existing={existing} annotations={markers} />
              <p className="text-xs text-slate-600" aria-live="polite" data-testid="plan-summary">
                {describePlan(plan)}
                {skipped > 0 && <span className="text-red-600"> · {skipped} overlap existing stalls/markers and will be skipped</span>}
                {perimeter && plan.stalls.length > 0 && <span className="text-slate-500"> · dotted = open side</span>}
              </p>
            </div>
          )}

          {perimeter ? (
            <>
              <SectionTitle>Walls & aisles</SectionTitle>
              <fieldset className="col-span-full">
                <legend className="mb-1.5 text-xs font-medium text-slate-600">Attach stalls to</legend>
                <div className="flex flex-wrap gap-2">
                  {WALLS.map((w) => {
                    const on = v.walls.includes(w.value);
                    return (
                      <button
                        key={w.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleWall(w.value)}
                        className={cx(
                          'rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-blue-600',
                          on ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                  <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-700">
                    <input type="checkbox" className="h-4 w-4 accent-blue-600" {...form.register('islands')} />
                    Centre islands (back-to-back)
                  </label>
                </div>
                {form.formState.errors.walls?.message && (
                  <p role="alert" className="mt-1 text-xs text-red-600">
                    {form.formState.errors.walls.message}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">Leave a wall free for entry / exit (the bottom wall by default).</p>
              </fieldset>
              <NumberField form={form} name="aisle" label={`Aisle width (${unit})`} min={0} step={data.ground.gridSize} />
              <NumberField form={form} name="wallGap" label={`Gap from walls (${unit})`} min={0} step={data.ground.gridSize} hint="0 = attached" />
            </>
          ) : (
            <>
              <SectionTitle>Grid</SectionTitle>
              <NumberField form={form} name="rows" label="Rows" step={1} min={1} />
              <NumberField form={form} name="columns" label="Columns" step={1} min={1} />
              <div
                className={cx(
                  'col-span-2 flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs',
                  exceeded ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600',
                )}
                aria-live="polite"
              >
                <span>
                  Fits up to <strong>{fit.rows}</strong> × <strong>{fit.cols}</strong> = <strong>{fit.total}</strong>
                  {exceeded && ' — extra stalls will be dropped'}
                </span>
                <Button size="sm" icon={<Wand2 size={14} />} onClick={applyMaxFit}>
                  Auto-fill max
                </Button>
              </div>
              <NumberField form={form} name="gapX" label="Gap X" />
              <NumberField form={form} name="gapY" label="Gap Y" />
              <NumberField form={form} name="startX" label="Start X" />
              <NumberField form={form} name="startY" label="Start Y" />
              <div className="col-span-full">
                <p className="mb-1.5 text-xs font-medium text-slate-600">Open sides on every stall</p>
                <OpenSidesPicker state={sideStates([{ openSides: v.openSides }])} onToggle={toggleGridSide} size="sm" />
              </div>
            </>
          )}

          <SectionTitle>Stall size ({unit})</SectionTitle>
          <SelectField
            form={form}
            name="sizePreset"
            label="Size preset"
            options={STALL_SIZE_PRESETS.map((p) => ({ value: p.label, label: p.label }))}
            onValueChange={onPresetChange}
          />
          <NumberField form={form} name="stallWidth" label={perimeter ? 'Frontage (along aisle)' : 'Width'} onValueChange={onSizeEdited} />
          <NumberField form={form} name="stallHeight" label={perimeter ? 'Depth (to wall)' : 'Length'} onValueChange={onSizeEdited} />
          <div />

          <SectionTitle>Type & pricing</SectionTitle>
          <SelectField form={form} name="stallType" label="Stall type" options={STALL_TYPES.map((t) => ({ value: t, label: t }))} />
          {v.stallType === 'Corner' ? <SelectField form={form} name="cornerOrientation" label="Cut corner" options={CORNER_ORIENTATIONS} /> : <div />}
          <NumberField
            form={form}
            name="basePrice"
            label="Base price (₹)"
            step={500}
            min={0}
            hint={Number.isFinite(v.basePrice) ? formatPrice(Number(v.basePrice)) : undefined}
            className="col-span-2"
          />
          <label className="col-span-2 inline-flex items-center gap-1.5 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-blue-600" {...form.register('isBillable')} />
            Billable
          </label>
        </div>
      </form>
    </Modal>
  );
}
