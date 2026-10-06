import { z } from 'zod';
import { ANNOTATION_TYPE_VALUES, type StallLayoutData } from './types';

/** Runtime validation for layouts coming from storage or the network. */
const statusSchema = z.enum(['available', 'reserved', 'booked', 'allocated', 'blocked']);
const cornerSchema = z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
export const annotTypeSchema = z.enum(ANNOTATION_TYPE_VALUES);

export const groundSchema = z.object({
  id: z.number(),
  exhibitionName: z.string(),
  venueName: z.string(),
  unit: z.enum(['meter', 'feet']),
  width: z.number().positive(),
  height: z.number().positive(),
  gridSize: z.number().positive(),
});

export const hangarSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const stallSchema = z.object({
  id: z.number(),
  hangarId: z.number(),
  stallNo: z.string(),
  stallCode: z.string(),
  stallType: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  area: z.number(),
  basePrice: z.number(),
  finalPrice: z.number(),
  status: statusSchema,
  exhibitorName: z.string().nullable(),
  stallBookingId: z.number().optional(),
  cornerOrientation: cornerSchema.optional(),
  openSides: z.array(z.enum(['top', 'right', 'bottom', 'left'])).optional(),
});

export const annotationSchema = z.object({
  id: z.number(),
  type: annotTypeSchema,
  label: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  hangarId: z.number().nullable(),
});

export const layoutDataSchema = z.object({
  ground: groundSchema,
  hangars: z.array(hangarSchema),
  stalls: z.array(stallSchema),
  annotations: z.array(annotationSchema),
});

// Compile-time guarantee that the schema and the wire types never drift apart.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _schemaMatchesTypes: Exact<z.infer<typeof layoutDataSchema>, StallLayoutData> = true;
void _schemaMatchesTypes;
