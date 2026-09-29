import { z } from 'zod';
import {
  ANNOTATION_TYPE_VALUES,
  type AddHangarForm,
  type GenerateGroundForm,
  type HangarEditForm,
} from '../domain/types';
import type { GenerateStallsInput } from '../domain/stallLayout';
import type { AnnotationDraft, StallFormValues } from '../store/actions';

const num = (label = 'Required.') => z.number({ error: label });
const positive = () => num().positive('Must be positive.');
const nonNeg = () => num().min(0, 'Cannot be negative.');
const atLeast1 = () => num().int('Whole number.').min(1, 'At least 1.');
const required = () => z.string().trim().min(1, 'Required.');
const corner = z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const status = z.enum(['available', 'reserved', 'booked', 'blocked']);

export const generateGroundSchema = z.object({
  exhibitionName: required(),
  venueName: required(),
  unit: z.enum(['meter', 'feet']),
  width: positive(),
  height: positive(),
  gridSize: positive(),
  numHangars: atLeast1(),
  hangarPrefix: required(),
  hangarWidth: positive(),
  hangarHeight: positive(),
  gap: nonNeg(),
  startX: nonNeg(),
  startY: nonNeg(),
  hangarsPerRow: atLeast1(),
}) satisfies z.ZodType<GenerateGroundForm>;

export const hangarSchema = z.object({
  name: required(),
  code: required(),
  x: nonNeg(),
  y: nonNeg(),
  width: positive(),
  height: positive(),
}) satisfies z.ZodType<AddHangarForm & HangarEditForm>;

const sides = z.array(z.enum(['top', 'right', 'bottom', 'left']));

/** Fields that only apply to one pattern are validated only for that pattern (hidden fields never block submit). */
export const generateStallsSchema = z
  .object({
    hangarId: num('Select a hangar.').int().min(1, 'Select a hangar.'),
    pattern: z.enum(['perimeter', 'grid']),
    rows: num(),
    columns: num(),
    prefix: required(),
    startNumber: nonNeg().int('Whole number.'),
    sizePreset: z.string(),
    stallWidth: positive(),
    stallHeight: positive(),
    gapX: num(),
    gapY: num(),
    startX: num(),
    startY: num(),
    stallType: required(),
    basePrice: nonNeg(),
    cornerOrientation: corner,
    walls: sides,
    wallGap: num(),
    aisle: num(),
    islands: z.boolean(),
    openSides: sides,
  })
  .superRefine((v, ctx) => {
    const need = (ok: boolean, path: keyof typeof v, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (v.pattern === 'grid') {
      need(Number.isInteger(v.rows) && v.rows >= 1, 'rows', 'At least 1.');
      need(Number.isInteger(v.columns) && v.columns >= 1, 'columns', 'At least 1.');
      for (const k of ['gapX', 'gapY', 'startX', 'startY'] as const) need(Number.isFinite(v[k]) && v[k] >= 0, k, 'Cannot be negative.');
    } else {
      need(v.walls.length > 0 || v.islands, 'walls', 'Pick at least one wall, or turn on centre islands.');
      need(Number.isFinite(v.wallGap) && v.wallGap >= 0, 'wallGap', 'Cannot be negative.');
      need(Number.isFinite(v.aisle) && v.aisle >= 0, 'aisle', 'Cannot be negative.');
    }
  }) satisfies z.ZodType<GenerateStallsInput>;

export const stallEditSchema = z
  .object({
    stallNo: required(),
    stallType: required(),
    width: positive(),
    height: positive(),
    x: nonNeg(),
    y: nonNeg(),
    basePrice: nonNeg(),
    finalPrice: nonNeg(),
    status,
    exhibitorName: z.string(),
    cornerOrientation: corner,
    openSides: z.array(z.enum(['top', 'right', 'bottom', 'left'])).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.status === 'reserved' || v.status === 'booked') && !v.exhibitorName.trim()) {
      ctx.addIssue({ code: 'custom', path: ['exhibitorName'], message: 'Exhibitor name is required for reserved/booked stalls.' });
    }
  }) satisfies z.ZodType<StallFormValues>;

export const annotationSchema = z.object({
  type: z.enum(ANNOTATION_TYPE_VALUES),
  label: z.string().max(40, 'Keep it under 40 characters.'),
  width: positive(),
  height: positive(),
  placement: z.enum(['inside', 'outside']),
  side: z.enum(['top', 'bottom', 'left', 'right']),
  gap: nonNeg(),
}) satisfies z.ZodType<AnnotationDraft>;
