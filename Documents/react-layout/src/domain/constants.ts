import type {
  AnnotationType,
  CornerOrientation,
  LayoutConfigItem,
  StallSizePreset,
  StallStatus,
} from './types';

export const CORNER_ORIENTATIONS: { value: CornerOrientation; label: string }[] = [
  { value: 'top-right', label: 'Top Right' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
];

export const STALL_SIZE_PRESETS: StallSizePreset[] = [
  { label: '2×3', width: 2, height: 3 },
  { label: '2×4', width: 2, height: 4 },
  { label: '3×3', width: 3, height: 3 },
  { label: '3×4', width: 3, height: 4 },
  { label: '4×4', width: 4, height: 4 },
  { label: 'Custom', width: 0, height: 0 },
];

export const STALL_TYPES = ['Standard', 'Premium', 'Corner', 'VIP', 'Custom'] as const;

/** Small identifying glyph drawn on stall types that should stand out. */
export const STALL_TYPE_SYMBOLS: Record<string, string> = {
  Premium: '⭐',
  VIP: '👑',
};

export const STALL_STATUSES: StallStatus[] = ['available', 'reserved', 'booked', 'allocated', 'blocked'];

export const STATUS_LABELS: Record<StallStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  booked: 'Booked',
  allocated: 'Allocated',
  blocked: 'Blocked',
};

export const STATUS_SHORT_LABELS: Record<StallStatus, string> = {
  available: 'Avail',
  reserved: 'Rsvd',
  booked: 'Bkd',
  allocated: 'Alloc',
  blocked: 'Blkd',
};

export interface ColorSet {
  fill: string;
  stroke: string;
  text: string;
}

/** Default/fallback colours — matches the backend's proposed LayoutConfigItem seed exactly
 *  (see LAYOUT_PHASE1_DECISIONS.md item 3) so there's no visible flash/mismatch before the
 *  config fetch (store/layoutConfig.ts) resolves, and tests/offline repos keep working
 *  without it. */
export const STALL_COLORS: Record<StallStatus, ColorSet> = {
  available: { fill: '#dcfce7', stroke: '#16a34a', text: '#15803d' },
  reserved: { fill: '#fef3c7', stroke: '#d97706', text: '#92400e' },
  booked: { fill: '#fee2e2', stroke: '#dc2626', text: '#991b1b' },
  allocated: { fill: '#ede9fe', stroke: '#7c3aed', text: '#5b21b6' },
  blocked: { fill: '#f1f5f9', stroke: '#94a3b8', text: '#475569' },
};

export const SEL_COLORS: ColorSet = { fill: '#dbeafe', stroke: '#2563eb', text: '#1d4ed8' };

/** Looks up a stall status's colour in the fetched config first, falling back to the
 *  STALL_COLORS default when the config hasn't loaded (or the active repository doesn't
 *  implement getConfig()) or has no entry for this status. See LayoutConfigItem's doc comment. */
export function stallColorFor(config: readonly LayoutConfigItem[], status: StallStatus): ColorSet {
  const entry = config.find((c) => c.kind === 'StallStatus' && c.code === status);
  return entry ? { fill: entry.colorFill, stroke: entry.colorStroke, text: entry.colorText } : STALL_COLORS[status];
}

/** Same lookup for a status's display label. */
export function stallStatusLabelFor(config: readonly LayoutConfigItem[], status: StallStatus): string {
  return config.find((c) => c.kind === 'StallStatus' && c.code === status)?.name ?? STATUS_LABELS[status];
}

export const ANNOT_COLORS: Record<AnnotationType, { fill: string; stroke: string }> = {
  entry: { fill: '#dcfce7', stroke: '#16a34a' },
  exit: { fill: '#fee2e2', stroke: '#dc2626' },
  'entry-exit': { fill: '#dbeafe', stroke: '#2563eb' },
  ticketing: { fill: '#fef3c7', stroke: '#d97706' },
  'gift-counter': { fill: '#fce7f3', stroke: '#db2777' },
  washroom: { fill: '#ecfeff', stroke: '#0891b2' },
  'open-area': { fill: '#f1f5f9', stroke: '#94a3b8' },
  walking: { fill: '#ede9fe', stroke: '#7c3aed' },
  road: { fill: '#475569', stroke: '#334155' },
  parking: { fill: '#e0f2fe', stroke: '#0369a1' },
  cctv: { fill: '#e2e8f0', stroke: '#334155' },
  'fire-exit': { fill: '#ffedd5', stroke: '#c2410c' },
};

export const ANNOT_TYPES: { value: AnnotationType; emoji: string; label: string }[] = [
  { value: 'entry', emoji: '🚪', label: 'Entry Gate' },
  { value: 'exit', emoji: '🚪', label: 'Exit Gate' },
  { value: 'entry-exit', emoji: '🚪', label: 'Entry + Exit' },
  { value: 'ticketing', emoji: '🎟', label: 'Ticketing Counter' },
  { value: 'gift-counter', emoji: '🎁', label: 'Gift Counter' },
  { value: 'washroom', emoji: '🚻', label: 'Washroom' },
  { value: 'open-area', emoji: '☁', label: 'Open Area' },
  { value: 'walking', emoji: '🚶', label: 'Walking Path' },
  { value: 'road', emoji: '🛣️', label: 'Road' },
  { value: 'parking', emoji: '🅿️', label: 'Parking Area' },
  { value: 'cctv', emoji: '📹', label: 'CCTV Camera' },
  { value: 'fire-exit', emoji: '🏃', label: 'Fire Exit' },
];

export function annotationMeta(type: AnnotationType) {
  return ANNOT_TYPES.find((t) => t.value === type) ?? { value: type, emoji: '📍', label: type };
}

export const UNIT_LABELS = { meter: 'm', feet: 'ft' } as const;

/** Maximum undo depth. */
export const HISTORY_LIMIT = 50;

/** Canvas pixels per layout unit at zoom 1. */
export const PX_PER_UNIT = 20;
