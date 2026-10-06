import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button, cx, Modal } from '../components/ui';
import { ANNOT_COLORS, ANNOT_TYPES, annotationMeta, UNIT_LABELS } from '../domain/constants';
import { snap } from '../domain/geometry';
import {
  allowedAnnotationTypes,
  GROUND_SIDES,
  groundLocation,
  gapFromGround,
  inferSide,
  parkingCapacity,
  placementRule,
  sideLabel,
} from '../domain/site';
import type { AnnotationType, ExhibitionGround, GroundSide } from '../domain/types';
import { saveAnnotation, validateAnnotation, type AnnotationDraft } from '../store/actions';
import { useLayoutStore } from '../store/layoutStore';
import { FormError, NumberField, SectionTitle, SelectField, TextField } from './fields';
import { annotationSchema } from './schemas';

/**
 * Form values mirror AnnotationDraft, except that for roads `width` is the
 * length ALONG the chosen side and `height` is the road width — converted to
 * a real rect by orientSize() on submit.
 */
type Values = AnnotationDraft;

function unitScale(g: ExhibitionGround): number {
  return g.unit === 'feet' ? 3.28 : 1;
}

/** Sensible starting size per type, in form-field semantics. */
function defaultSize(type: AnnotationType, side: GroundSide, g: ExhibitionGround): { width: number; height: number } {
  const k = unitScale(g);
  const r = (v: number) => snap(v * k, g.gridSize);
  switch (type) {
    case 'road':
      return { width: side === 'top' || side === 'bottom' ? g.width : g.height, height: r(6) };
    case 'parking':
      return { width: r(20), height: r(12) };
    case 'open-area':
      return { width: r(6), height: r(4) };
    case 'walking':
      return { width: r(8), height: r(2) };
    case 'washroom':
      return { width: r(4), height: r(3) };
    default:
      return { width: r(3), height: r(2) };
  }
}

/** Road orientation: 'h' runs left↔right (beside top/bottom), 'v' runs up↔down (beside left/right). */
type Orient = 'h' | 'v';
const sideOrient = (side: GroundSide): Orient => (side === 'top' || side === 'bottom' ? 'h' : 'v');

export default function AnnotationForm({
  hangarId,
  annotationId,
  presetType,
  onClose,
}: {
  hangarId: number | null;
  annotationId: number | null;
  presetType?: AnnotationType | undefined;
  onClose: () => void;
}) {
  const data = useLayoutStore((s) => s.data)!;
  const ground = data.ground;
  const unit = UNIT_LABELS[ground.unit];
  const existing = annotationId !== null ? data.annotations.find((a) => a.id === annotationId) : undefined;
  const hangar = hangarId !== null ? data.hangars.find((h) => h.id === hangarId) : undefined;
  const groundScope = hangarId === null;
  const types = allowedAnnotationTypes(groundScope ? 'ground' : 'hangar');
  const scopeLabel = hangar ? hangar.name : 'the ground and its surroundings';
  const sizeTouched = useRef(!!existing);
  /**
   * For roads the form edits "length" (long axis) and "road width"; `orient`
   * maps them back to a rect. Editing keeps the road's current orientation,
   * so Details, the canvas label and this form all agree on which is which.
   */
  const orient = useRef<Orient>(existing ? (existing.width >= existing.height ? 'h' : 'v') : 'h');

  const defaultValues = useMemo<Values>(() => {
    if (existing) {
      const outside = existing.hangarId === null && groundLocation(existing, ground) === 'outside';
      const side = (outside && inferSide(existing, ground)) || 'top';
      const road = existing.type === 'road';
      const vertical = orient.current === 'v';
      return {
        type: existing.type,
        // An auto-filled type name stays blank here, so changing the type also changes the name.
        label: existing.label === annotationMeta(existing.type).label ? '' : existing.label,
        width: road && vertical ? existing.height : existing.width,
        height: road && vertical ? existing.width : existing.height,
        placement: outside ? 'outside' : 'inside',
        side,
        gap: outside ? Math.max(0, gapFromGround(existing, side, ground)) : 0,
      };
    }
    const type: AnnotationType = presetType && types.includes(presetType) ? presetType : 'entry';
    return {
      type,
      label: '',
      ...defaultSize(type, 'top', ground),
      placement: type === 'road' || type === 'parking' ? 'outside' : 'inside',
      side: 'top',
      gap: 0,
    };
  }, []);

  const form = useForm<Values>({ resolver: zodResolver(annotationSchema), defaultValues, mode: 'onTouched' });
  const [type, placement, side, width, height] = useWatch({ control: form.control, name: ['type', 'placement', 'side', 'width', 'height'] });
  const rule = groundScope ? placementRule(type) : 'inside';
  const outside = groundScope && (rule === 'outside' || (rule === 'either' && placement === 'outside'));
  const isRoad = type === 'road';

  const applyDefaults = (nextType: AnnotationType, nextSide: GroundSide) => {
    if (sizeTouched.current) return;
    const size = defaultSize(nextType, nextSide, ground);
    form.setValue('width', size.width, { shouldValidate: true });
    form.setValue('height', size.height, { shouldValidate: true });
  };

  const swapSizeFields = () => {
    const [w, h] = form.getValues(['width', 'height']);
    form.setValue('width', h, { shouldValidate: true });
    form.setValue('height', w, { shouldValidate: true });
  };

  const onTypeChange = (nextType: AnnotationType) => {
    const wasRoad = type === 'road';
    const willBeRoad = nextType === 'road';
    // Keep the same footprint when switching to/from Road: road fields are length/width, not W/H.
    if (groundScope && wasRoad !== willBeRoad) {
      if (willBeRoad) {
        // "Length along side" always runs parallel to the chosen side; keep the footprint.
        orient.current = sideOrient(side);
        if (orient.current === 'v') swapSizeFields();
      } else if (orient.current === 'v') {
        swapSizeFields();
      }
    }
    if (form.getValues('label').trim() === annotationMeta(type).label) form.setValue('label', '');
    if (placementRule(nextType) === 'outside') form.setValue('placement', 'outside');
    if (nextType === 'parking' && !existing) form.setValue('placement', 'outside');
    applyDefaults(nextType, side);
  };

  const onSideChange = (next: GroundSide) => {
    if (type !== 'road') return;
    // Turn the road only when the side's axis changes (top/bottom ↔ left/right), so
    // switching away and back never rotates it — spur roads stay perpendicular.
    if (sideOrient(side) !== sideOrient(next)) orient.current = orient.current === 'h' ? 'v' : 'h';
    applyDefaults(type, next);
  };

  // A gap only matters outside; don't let a hidden, invalid gap block submit.
  useEffect(() => {
    if (outside) return;
    const g = form.getValues('gap');
    if (!Number.isFinite(g) || g < 0) form.setValue('gap', 0);
    form.clearErrors('gap');
  }, [outside, form]);

  const onSubmit = form.handleSubmit((values) => {
    const roadVertical = values.type === 'road' && groundScope && orient.current === 'v';
    const size = roadVertical ? { width: values.height, height: values.width } : { width: values.width, height: values.height };
    const draft: AnnotationDraft = {
      ...values,
      ...size,
      placement: rule === 'outside' ? 'outside' : values.placement,
      gap: outside ? values.gap : 0,
    };
    const errors = validateAnnotation(hangarId, draft);
    if (Object.keys(errors).length) {
      // Errors are keyed by rect axis; a vertical road's length is the rect's height.
      const field = (k: string) => (roadVertical ? (k === 'width' ? 'height' : k === 'height' ? 'width' : k) : k);
      for (const [f, m] of Object.entries(errors)) form.setError(field(f) as keyof Values, { message: m });
      return;
    }
    const error = saveAnnotation(hangarId, annotationId, draft);
    if (error) {
      form.setError('root', { message: error });
      return;
    }
    onClose();
  });

  const capacity = type === 'parking' && width > 0 && height > 0 ? parkingCapacity(width, height, ground.unit) : null;

  return (
    <Modal
      title={existing ? `Edit ${annotationMeta(existing.type).label}` : isRoad ? 'Add Road' : type === 'parking' ? 'Add Parking Area' : 'Add Marker'}
      description={`Gates, counters (ticketing, gift, washroom), parking, roads and area markers placed on ${scopeLabel}.`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="annotation-form">
            {existing ? 'Save changes' : isRoad ? 'Add road' : type === 'parking' ? 'Add parking' : 'Add marker'}
          </Button>
        </>
      }
    >
      <form id="annotation-form" onSubmit={onSubmit} noValidate>
        <FormError message={form.formState.errors.root?.message ?? form.formState.errors.type?.message} />
        <fieldset className="mb-4">
          <legend className="mb-1.5 text-xs font-medium text-slate-600">Type</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ANNOT_TYPES.filter((t) => types.includes(t.value)).map((t) => {
              const active = type === t.value;
              const reg = form.register('type');
              return (
                <label
                  key={t.value}
                  className={cx(
                    'flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-600',
                    active ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <input
                    type="radio"
                    value={t.value}
                    className="sr-only"
                    {...reg}
                    onChange={(e) => {
                      void reg.onChange(e);
                      onTypeChange(e.target.value as AnnotationType);
                    }}
                  />
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm"
                    style={{ background: ANNOT_COLORS[t.value].fill }}
                    aria-hidden
                  >
                    {t.emoji}
                  </span>
                  <span className="leading-tight">{t.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <TextField
            form={form}
            name="label"
            label="Label"
            placeholder={isRoad ? 'e.g. NH-48 Service Road' : annotationMeta(type).label}
            autoFocus
            className="col-span-2"
            hint="Leave blank to use the type name."
          />

          {groundScope && rule !== 'inside' && (
            <>
              <SectionTitle>Placement</SectionTitle>
              {rule === 'either' ? (
                <fieldset className="col-span-2">
                  <legend className="sr-only">Inside or outside the ground</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(['inside', 'outside'] as const).map((p) => (
                      <label
                        key={p}
                        className={cx(
                          'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-600',
                          placement === p ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-200 hover:bg-slate-50',
                        )}
                      >
                        <input type="radio" value={p} className="accent-blue-600" {...form.register('placement')} />
                        {p === 'inside' ? 'Inside the ground' : 'Outside the ground'}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <p className="col-span-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Roads always run outside the planned ground, beside the side you choose.
                </p>
              )}
              {outside && (
                <>
                  <SelectField
                    form={form}
                    name="side"
                    label="Beside which side"
                    options={GROUND_SIDES}
                    onValueChange={(v) => onSideChange(v as GroundSide)}
                  />
                  <NumberField form={form} name="gap" label={`Gap from ground edge (${unit})`} min={0} step={ground.gridSize} />
                </>
              )}
            </>
          )}

          <SectionTitle>Size</SectionTitle>
          <NumberField
            form={form}
            name="width"
            label={isRoad && groundScope ? `Length along side (${unit})` : `Width (${unit})`}
            onValueChange={() => (sizeTouched.current = true)}
          />
          <NumberField
            form={form}
            name="height"
            label={isRoad && groundScope ? `Road width (${unit})` : `Length (${unit})`}
            onValueChange={() => (sizeTouched.current = true)}
            hint={capacity !== null ? `≈ ${capacity} car${capacity === 1 ? '' : 's'} (25 m² per car incl. aisles)` : undefined}
          />
          {isRoad && groundScope && (
            <p className="col-span-2 text-xs text-slate-500">
              The {sideLabel(side).toLowerCase()} side of the ground is {side === 'top' || side === 'bottom' ? ground.width : ground.height} {unit} long. You can drag or resize the road afterwards in Edit layout mode.
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
