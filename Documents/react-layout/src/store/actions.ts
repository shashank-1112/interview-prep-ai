/**
 * User-level commands. Each wraps a pure domain op, guards it with a confirm
 * dialog where the original app did, commits one undo snapshot, and reports
 * the outcome with a toast. Components call these — never the repository.
 */
import { toast } from 'sonner';
import {
  alignStalls,
  applyBulk,
  deleteHangar as deleteHangarOp,
  distributeStalls,
  duplicateHangar as duplicateHangarOp,
  duplicateStalls,
  generateGround,
  generateStalls,
  hangarContentExtent,
  mergeCandidate,
  mergeStalls,
  moveStalls,
  setStallRects,
  splitStall,
  stallArea,
  withOpenSide,
  validateHangarDraft,
  type AlignEdge,
  type BulkAction,
  type HangarDraft,
} from '../domain/layoutOps';
import { applyBookingAction, BOOKING_ACTIONS, type BookingAction } from '../domain/booking';
import type { GenerateStallsInput } from '../domain/stallLayout';
import { clamp, clean, findFreeSpot, isSelfIntersectingPolygon, nextId, rectsOverlap } from '../domain/geometry';
import { annotationMeta, STATUS_LABELS } from '../domain/constants';
import {
  atGap,
  blocksHangars,
  groundLocation,
  inferSide,
  maxOutsideSize,
  placeBesideGround,
  placementName,
  placementRule,
  siteBounds,
  sideLabel,
  validateGroundAnnotationRect,
} from '../domain/site';
import { boundingBox } from '../domain/geometry';
import type {
  AnnotationType,
  GenerateGroundForm,
  GroundSide,
  GenerateStallsForm,
  Hangar,
  LayoutAnnotation,
  Point,
  Rect,
  RectSide,
  Stall,
  StallEditForm,
  StallLayoutData,
} from '../domain/types';
import type { AssignableBooking } from '../repository/LayoutRepository';
import { useLayoutStore } from './layoutStore';

const store = () => useLayoutStore.getState();
const data = (): StallLayoutData | null => store().data;
const grid = () => data()?.ground.gridSize ?? 0.5;

function confirm(title: string, message: string, onConfirm: () => void, tone: 'primary' | 'danger' = 'primary', confirmLabel?: string) {
  store().requestConfirm({ title, message, onConfirm, tone, ...(confirmLabel ? { confirmLabel } : {}) });
}

// ── Persistence / history ────────────────────────────────────────────────────

export async function saveLayout(): Promise<void> {
  const ok = await store().saveNow();
  if (ok) toast.success('Layout saved.', { id: 'save' });
  else toast.error(store().saveError ?? 'Could not save layout.', { id: 'save' });
}

export function undo(): void {
  if (store().undo()) toast('Undone', { id: 'history', duration: 1200 });
}

export function redo(): void {
  if (store().redo()) toast('Redone', { id: 'history', duration: 1200 });
}

export function clearAll(): void {
  confirm(
    'Clear All',
    'This will discard all data and return to a blank layout. Continue? (Ctrl+Z to undo)',
    () => {
      store().replaceLayout(null);
      store().setEditMode(false);
      store().resetFilters();
      toast.success('Layout cleared.');
    },
    'danger',
    'Clear layout',
  );
}

export function loadDemoLayout(): void {
  const apply = () => {
    const repo = store().repo;
    if (!repo) return;
    store().replaceLayout(repo.getDefaultLayout());
    store().requestFit('ground', 'content');
    toast.success('Demo layout loaded.');
  };
  if (data()) confirm('Load Demo Layout', 'Replace the current layout with the demo layout? (Ctrl+Z to undo)', apply, 'danger');
  else apply();
}

// ── Ground & hangars ─────────────────────────────────────────────────────────

/** Returns an error message for the form, or null on success. */
export function generateGroundLayout(form: GenerateGroundForm): string | null {
  const s = store();
  const r = generateGround(form, s.exhibitionMeta ?? { name: '', venueName: '' });
  if (!r.ok) return r.error;
  s.replaceLayout(r.value);
  s.selectGround(r.value.hangars[0] ? { kind: 'hangar', id: r.value.hangars[0].id } : null);
  s.requestFit('ground', 'content');
  toast.success(`Ground created with ${r.value.hangars.length} hangar(s).`);
  return null;
}

export type HangarErrors = Partial<Record<keyof HangarDraft, string>>;

export function addHangar(draft: HangarDraft): HangarErrors | null {
  const d = data();
  if (!d) return { name: 'Generate a ground first.' };
  const errors = validateHangarDraft(d, draft, null);
  if (Object.keys(errors).length) return errors;
  const hangar: Hangar = {
    id: nextId(d.hangars),
    name: draft.name.trim(),
    code: draft.code.trim().toUpperCase(),
    x: draft.x,
    y: draft.y,
    width: draft.width,
    height: draft.height,
  };
  store().commit((cur) => ({ ...cur, hangars: [...cur.hangars, hangar] }));
  store().selectGround({ kind: 'hangar', id: hangar.id });
  toast.success(`Hangar "${hangar.name}" added.`);
  return null;
}

export function updateHangar(id: number, draft: HangarDraft): HangarErrors | null {
  const d = data();
  if (!d) return null;
  const errors = validateHangarDraft(d, draft, id);
  if (Object.keys(errors).length) return errors;
  store().commit((cur) => ({
    ...cur,
    hangars: cur.hangars.map((h) =>
      h.id === id ? { ...h, ...draft, name: draft.name.trim(), code: draft.code.trim().toUpperCase() } : h,
    ),
  }));
  toast.success(`Hangar "${draft.name.trim()}" updated.`);
  return null;
}

export function deleteHangar(id: number): void {
  const d = data();
  const hangar = d?.hangars.find((h) => h.id === id);
  if (!d || !hangar) return;
  const count = d.stalls.filter((s) => s.hangarId === id).length;
  const msg =
    count > 0
      ? `Delete hangar "${hangar.name}"? This will also delete ${count} stall(s) inside it. (Ctrl+Z to undo)`
      : `Delete hangar "${hangar.name}"? (Ctrl+Z to undo)`;
  confirm(
    'Delete Hangar',
    msg,
    () => {
      store().commit((cur) => deleteHangarOp(cur, id));
      if (store().bulk.filters.hangarId === id) store().setFilters({ hangarId: null });
      toast.success(`Hangar "${hangar.name}" deleted.`);
    },
    'danger',
    'Delete',
  );
}

/**
 * Duplicate a hangar at the same size into the nearest free spot. With
 * `withContents`, its stalls (reset to available, renumbered for the new
 * hangar) and hangar-scoped markers are copied too. One undo step.
 */
export function duplicateHangar(id: number, withContents: boolean): boolean {
  const d = data();
  if (!d) return false;
  const r = duplicateHangarOp(d, id, { withContents });
  if (!r.ok) {
    toast.error(r.error, { id: 'hangar-duplicate' });
    return false;
  }
  store().commit(() => r.value.data);
  store().selectGround({ kind: 'hangar', id: r.value.hangar.id });
  const extra = withContents
    ? ` with ${r.value.stallCount} stall${r.value.stallCount === 1 ? '' : 's'}${r.value.markerCount ? ` and ${r.value.markerCount} marker(s)` : ''}`
    : '';
  toast.success(`"${r.value.hangar.name}" created${extra}.`);
  return true;
}

/**
 * Commit a hangar's new geometry from a drag or Transformer resize.
 * Returns false (and changes nothing) when the result would overlap another hangar
 * or cut off its contents — the canvas then snaps the node back.
 */
export function setHangarRect(id: number, rect: Rect): boolean {
  const d = data();
  const hangar = d?.hangars.find((h) => h.id === id);
  if (!d || !hangar) return false;
  if (rect.x === hangar.x && rect.y === hangar.y && rect.width === hangar.width && rect.height === hangar.height) {
    return true;
  }
  if (d.hangars.some((h) => h.id !== id && rectsOverlap(rect, h))) {
    toast.warning('Hangars cannot overlap — move reverted.', { id: 'hangar-overlap' });
    return false;
  }
  // Only NEW overlaps block a move/resize, so legacy overlaps can still be fixed by moving the hangar.
  const blocker = d.annotations.find((a) => blocksHangars(a) && rectsOverlap(rect, a) && !rectsOverlap(hangar, a));
  if (blocker) {
    toast.warning(`That spot is taken by "${blocker.label}" — move reverted.`, { id: 'hangar-overlap' });
    return false;
  }
  const extent = hangarContentExtent(d, id);
  if (rect.width + 1e-6 < extent.width || rect.height + 1e-6 < extent.height) {
    toast.warning('Stalls would fall outside the hangar — resize/move them first.', { id: 'hangar-extent' });
    return false;
  }
  store().commit((cur) => ({
    ...cur,
    hangars: cur.hangars.map((h) => (h.id === id ? { ...h, ...rect } : h)),
  }));
  return true;
}

// ── Stalls ───────────────────────────────────────────────────────────────────

export function generateStallsInHangar(form: GenerateStallsForm & Partial<Omit<GenerateStallsInput, keyof GenerateStallsForm>>): { error: string; field?: string } | null {
  const d = data();
  if (!d) return { error: 'Generate a ground first.' };
  const r = generateStalls(d, form);
  if (!r.ok) return r.field === undefined ? { error: r.error } : { error: r.error, field: r.field };
  for (const w of r.value.generatedIds.length ? r.warnings : []) toast.warning(w);
  if (r.value.generatedIds.length === 0) {
    return { error: r.warnings[0] ?? 'No stalls could be placed with these settings.' };
  }
  store().commit((cur) => ({ ...cur, stalls: r.value.stalls }));
  const hangar = d.hangars.find((h) => h.id === form.hangarId);
  toast.success(`${r.value.generatedIds.length} stall(s) generated in ${hangar?.name ?? 'hangar'}.`);
  if (store().editor.hangarId === form.hangarId) store().requestFit('editor', 'content');
  return null;
}

/** Stall form values: the ported StallEditForm plus the open-sides picker. */
export type StallFormValues = StallEditForm & { openSides?: RectSide[] };

export type StallErrors = Partial<Record<keyof StallFormValues, string>>;

function stallFromForm(base: Partial<Stall> & { id: number; hangarId: number }, f: StallFormValues, hangar: Hangar): Stall {
  const w = f.width;
  const h = f.height;
  const stall: Stall = {
    ...base,
    id: base.id,
    hangarId: base.hangarId,
    stallNo: f.stallNo.trim(),
    stallCode: f.stallNo.trim(),
    stallType: f.stallType,
    width: w,
    height: h,
    x: clean(clamp(f.x, 0, hangar.width - w)),
    y: clean(clamp(f.y, 0, hangar.height - h)),
    area: stallArea(w, h),
    basePrice: f.basePrice,
    finalPrice: f.finalPrice,
    status: f.status,
    isBillable: f.isBillable,
    exhibitorName: f.status === 'reserved' || f.status === 'booked' ? f.exhibitorName.trim() || null : null,
  };
  if (f.stallType === 'Corner') stall.cornerOrientation = f.cornerOrientation;
  else if (base.cornerOrientation) stall.cornerOrientation = base.cornerOrientation;
  const open = f.openSides ?? base.openSides ?? [];
  const { openSides: _drop, ...rest } = stall;
  return open.length ? { ...rest, openSides: (['top', 'right', 'bottom', 'left'] as const).filter((x) => open.includes(x)) } : rest;
}

function validateStallForm(d: StallLayoutData, f: StallFormValues, hangar: Hangar, excludeId: number | null): StallErrors {
  const errors: StallErrors = {};
  if (d.stalls.some((s) => s.id !== excludeId && s.hangarId === hangar.id && s.stallNo === f.stallNo.trim())) {
    errors.stallNo = 'Duplicate stall number in this hangar.';
  }
  if (f.width > hangar.width) errors.width = `Wider than the hangar (${hangar.width}).`;
  if (f.height > hangar.height) errors.height = `Taller than the hangar (${hangar.height}).`;
  return errors;
}

export function addStall(hangarId: number, f: StallFormValues): StallErrors | null {
  const d = data();
  const hangar = d?.hangars.find((h) => h.id === hangarId);
  if (!d || !hangar) return { stallNo: 'Hangar not found.' };
  const errors = validateStallForm(d, f, hangar, null);
  if (Object.keys(errors).length) return errors;
  const stall = stallFromForm({ id: nextId(d.stalls), hangarId }, f, hangar);
  store().commit((cur) => ({ ...cur, stalls: [...cur.stalls, stall] }));
  if (store().editor.hangarId === hangarId) store().setEditorStalls([stall.id]);
  toast.success(`Stall ${stall.stallNo} added.`);
  return null;
}

export function updateStall(id: number, f: StallFormValues): StallErrors | null {
  const d = data();
  const target = d?.stalls.find((s) => s.id === id);
  const hangar = d?.hangars.find((h) => h.id === target?.hangarId);
  if (!d || !target || !hangar) return { stallNo: 'Stall not found.' };
  const errors = validateStallForm(d, f, hangar, id);
  if (Object.keys(errors).length) return errors;
  const updated = stallFromForm(target, f, hangar);
  store().commit((cur) => ({ ...cur, stalls: cur.stalls.map((s) => (s.id === id ? updated : s)) }));
  toast.success(`Stall ${updated.stallNo} updated.`);
  return null;
}

/**
 * Mark `side` as an opening (dotted, no wall) on every given stall — or, when
 * it is already open on all of them, wall it up again. One undo step.
 */
export function toggleStallOpenSide(ids: Iterable<number>, side: RectSide): void {
  const idSet = new Set(ids);
  const d = data();
  const targets = d?.stalls.filter((s) => idSet.has(s.id)) ?? [];
  if (targets.length === 0) return;
  const open = !targets.every((s) => s.openSides?.includes(side));
  store().commit((cur) => ({ ...cur, stalls: cur.stalls.map((s) => (idSet.has(s.id) ? withOpenSide(s, side, open) : s)) }));
  const label = targets.length === 1 ? `Stall ${targets[0]!.stallNo}` : `${targets.length} stalls`;
  toast.success(`${label}: ${side} side ${open ? 'opened' : 'walled'}.`, { id: 'open-side', duration: 1500 });
}

export function deleteStalls(ids: Iterable<number>): void {
  const idSet = new Set(ids);
  const d = data();
  if (!d || idSet.size === 0) return;
  const targets = d.stalls.filter((s) => idSet.has(s.id));
  if (targets.length === 0) return;
  const label = targets.length === 1 ? `stall ${targets[0]!.stallNo}` : `${targets.length} stalls`;
  const committed = targets.filter((s) => s.status === 'booked' || s.status === 'reserved').length;
  const warn = committed > 0 ? ` ${committed} of them ${committed === 1 ? 'is' : 'are'} reserved/booked.` : '';
  confirm(
    targets.length === 1 ? 'Delete Stall' : 'Delete Stalls',
    `Delete ${label}?${warn} (Ctrl+Z to undo)`,
    () => {
      store().commit((cur) => ({ ...cur, stalls: cur.stalls.filter((s) => !idSet.has(s.id)) }));
      toast.success(`Deleted ${label}.`);
    },
    'danger',
    'Delete',
  );
}

export function moveStallsBy(ids: ReadonlySet<number>, dx: number, dy: number): void {
  const d = data();
  const first = d?.stalls.find((s) => ids.has(s.id));
  const hangar = d?.hangars.find((h) => h.id === first?.hangarId);
  if (!d || !hangar || (dx === 0 && dy === 0)) return;
  store().commit((cur) => {
    const stalls = moveStalls(cur.stalls, ids, dx, dy, hangar);
    return stalls === cur.stalls ? cur : { ...cur, stalls };
  });
}

export function setStallGeometry(rects: ReadonlyMap<number, Rect>): void {
  if (rects.size === 0) return;
  store().commit((cur) => {
    const stalls = setStallRects(cur.stalls, rects);
    return stalls === cur.stalls ? cur : { ...cur, stalls };
  });
}

export function alignSelection(edge: AlignEdge): void {
  const ids = store().editor.stallIds;
  if (ids.size < 2) {
    toast.warning('Select at least 2 stalls to align.');
    return;
  }
  store().commit((cur) => ({ ...cur, stalls: alignStalls(cur.stalls, ids, edge) }));
}

export function distributeSelection(axis: 'h' | 'v'): void {
  const ids = store().editor.stallIds;
  const d = data();
  if (!d) return;
  const r = distributeStalls(d.stalls, ids, axis);
  if (!r.ok) {
    toast.warning(r.error);
    return;
  }
  store().commit((cur) => ({ ...cur, stalls: r.value }));
}

export function duplicateSelection(): void {
  const s = store();
  const d = s.data;
  const hangar = d?.hangars.find((h) => h.id === s.editor.hangarId);
  if (!d || !hangar) return;
  const r = duplicateStalls(d.stalls, s.editor.stallIds, hangar, grid());
  if (!r.ok) {
    toast.warning(r.error);
    return;
  }
  s.commit((cur) => ({ ...cur, stalls: r.value.stalls }));
  s.setEditorStalls(r.value.newIds);
  const copies = r.value.stalls.filter((x) => r.value.newIds.includes(x.id));
  toast.success(copies.length === 1 ? `Stall ${copies[0]!.stallNo} duplicated.` : `${copies.length} stalls duplicated.`);
}

export function mergeSelection(): void {
  const s = store();
  if (!s.data) return;
  const candidate = mergeCandidate(s.data.stalls, s.editor.stallIds);
  if (!candidate) {
    toast.warning('Select two available, adjacent stalls (touching, no gap) to merge.');
    return;
  }
  confirm(
    'Merge Stalls',
    `Merge ${candidate.a.stallNo} and ${candidate.b.stallNo} into a single stall? (Ctrl+Z to undo)`,
    () => {
      const cur = data();
      if (!cur) return;
      const r = mergeStalls(cur.stalls, candidate);
      if (!r.ok) {
        toast.warning(r.error);
        return;
      }
      store().commit((c) => ({ ...c, stalls: r.value.stalls }));
      store().setEditorStalls([r.value.merged.id]);
      store().recordLayoutEvent({ type: 'merge', sourceStallLabels: [candidate.a.stallNo, candidate.b.stallNo], resultStallLabels: [r.value.merged.stallNo] });
      toast.success(`Merged into stall ${r.value.merged.stallNo}.`);
    },
    'primary',
    'Merge',
  );
}

export function splitSelection(axis: 'h' | 'v'): void {
  const s = store();
  const ids = [...s.editor.stallIds];
  const stall = s.data?.stalls.find((x) => x.id === ids[0]);
  if (!stall || ids.length !== 1) {
    toast.warning('Select a single stall to split.');
    return;
  }
  const dry = splitStall(s.data!.stalls, stall.id, axis, grid());
  if (!dry.ok) {
    toast.warning(dry.error);
    return;
  }
  const label = axis === 'h' ? 'horizontally (top / bottom)' : 'vertically (left / right)';
  confirm(
    'Split Stall',
    `Split ${stall.stallNo} ${label} into two equal stalls?`,
    () => {
      const cur = data();
      if (!cur) return;
      const r = splitStall(cur.stalls, stall.id, axis, grid());
      if (!r.ok) {
        toast.warning(r.error);
        return;
      }
      store().commit((c) => ({ ...c, stalls: r.value.stalls }));
      store().setEditorStalls([r.value.first.id, r.value.second.id]);
      store().recordLayoutEvent({ type: 'split', sourceStallLabels: [stall.stallNo], resultStallLabels: [r.value.first.stallNo, r.value.second.stallNo] });
      toast.success(`Stall ${stall.stallNo} split into ${r.value.first.stallNo} and ${r.value.second.stallNo}.`);
    },
    'primary',
    'Split',
  );
}

// ── Booking workflow ─────────────────────────────────────────────────────────

function commitBooking(stallId: number, action: BookingAction, exhibitorName?: string): boolean {
  const cur = data();
  const stall = cur?.stalls.find((s) => s.id === stallId);
  if (!stall) return false;
  try {
    const updated = applyBookingAction(stall, action, exhibitorName);
    store().commit((c) => ({ ...c, stalls: c.stalls.map((s) => (s.id === stallId ? updated : s)) }));
    toast.success(BOOKING_ACTIONS[action].successMessage(stall, updated.exhibitorName ?? undefined));
    return true;
  } catch (err) {
    toast.warning((err as Error).message);
    return false;
  }
}

/**
 * Reserve/Book are confirmed by the inline exhibitor-name form (as in the
 * original app); every other transition goes through the confirm dialog.
 *
 * Cancelling a stall that's actually linked to a real booking
 * (stall.stallBookingId set, repo API-backed) goes through unassignRealBooking
 * instead of the plain local edit below it — otherwise the booking would stay
 * marked as "linked" server-side and never show up as assignable again.
 */
export function runBookingAction(stallId: number, action: BookingAction, exhibitorName?: string): boolean {
  const meta = BOOKING_ACTIONS[action];
  if (meta.needsExhibitor) return commitBooking(stallId, action, exhibitorName);
  const stall = data()?.stalls.find((s) => s.id === stallId);
  if (!stall) return false;
  const isCancel = action === 'cancel-reservation' || action === 'cancel-booking';
  const useRealUnassign = isCancel && stall.stallBookingId != null && !!store().repo?.unassignStall;
  confirm(
    meta.confirmTitle,
    meta.confirmMessage(stall),
    () => {
      if (useRealUnassign) void unassignRealBooking(stallId, meta.successMessage(stall));
      else void commitBooking(stallId, action);
    },
    meta.tone === 'danger' ? 'danger' : 'primary',
    meta.label,
  );
  return true;
}

// ── Real booking assignment (only when the repository is API-backed) ───────

/** True only for a repository backed by the real Booking module — gates QuickActions' assign-dropdown vs. the free-text form. */
export function canAssignRealBookings(): boolean {
  return typeof store().repo?.assignStall === 'function';
}

export async function fetchAssignableBookings(): Promise<AssignableBooking[]> {
  const repo = store().repo;
  if (!repo?.getAssignableBookings) return [];
  return repo.getAssignableBookings();
}

function applyAssignedStall(updated: Stall): void {
  store().commit((c) => ({ ...c, stalls: c.stalls.map((s) => (s.id === updated.id ? updated : s)) }));
}

/** The only entry point into 'reserved'/'booked' when the repository is API-backed — see QuickActions' assign dropdown. */
export async function assignStallToBooking(stallId: number, stallBookingId: number): Promise<boolean> {
  const repo = store().repo;
  const stall = data()?.stalls.find((s) => s.id === stallId);
  if (!repo?.assignStall || !stall) return false;
  try {
    const updated = await repo.assignStall(stallId, stallBookingId);
    applyAssignedStall(updated);
    toast.success(`Stall ${stall.stallNo} ${updated.status === 'booked' ? 'booked' : 'reserved'} for ${updated.exhibitorName ?? 'the exhibitor'}.`);
    return true;
  } catch (err) {
    toast.error((err as Error).message);
    return false;
  }
}

async function unassignRealBooking(stallId: number, successMessage: string): Promise<boolean> {
  const repo = store().repo;
  if (!repo?.unassignStall) return false;
  try {
    applyAssignedStall(await repo.unassignStall(stallId));
    toast.success(successMessage);
    return true;
  } catch (err) {
    toast.error((err as Error).message);
    return false;
  }
}

// ── Bulk ─────────────────────────────────────────────────────────────────────

export function runBulkAction(action: BulkAction): void {
  const s = store();
  const ids = new Set(s.bulk.selectedIds);
  const count = ids.size;
  if (count === 0) return;
  const label =
    action.kind === 'status'
      ? `Set status → ${STATUS_LABELS[action.status]} on ${count} stall(s)?`
      : action.kind === 'price'
        ? `Set final price → ₹${action.finalPrice.toLocaleString('en-IN')} on ${count} stall(s)?`
        : action.kind === 'type'
          ? `Set type → ${action.stallType} on ${count} stall(s)?`
          : `Delete ${count} stall(s)? (Ctrl+Z to undo)`;
  confirm(
    action.kind === 'delete' ? 'Bulk Delete' : 'Apply Bulk Change',
    label,
    () => {
      store().commit((cur) => ({ ...cur, stalls: applyBulk(cur.stalls, ids, action) }));
      store().setBulkSelection([]);
      toast.success(action.kind === 'delete' ? `${count} stall(s) deleted.` : `${count} stall(s) updated.`);
    },
    action.kind === 'delete' ? 'danger' : 'primary',
    action.kind === 'delete' ? 'Delete' : 'Apply',
  );
}

// ── Annotations ──────────────────────────────────────────────────────────────

export interface AnnotationDraft {
  type: AnnotationType;
  label: string;
  /** Final rect size in layout units (the form converts road length/width per side). */
  width: number;
  height: number;
  /** Ground-level only: where an `either` type goes. Roads are always outside. */
  placement: 'inside' | 'outside';
  /** Ground-level outside placement: which side of the ground to sit beside. */
  side: GroundSide;
  /** Distance from the ground edge for outside placement. */
  gap: number;
}

type DraftErrors = Partial<Record<keyof AnnotationDraft, string>>;

function wantsOutside(draft: Pick<AnnotationDraft, 'type' | 'placement'>): boolean {
  const rule = placementRule(draft.type);
  return rule === 'outside' || (rule === 'either' && draft.placement === 'outside');
}

/** Ground-level obstacles for an inside placement: hangars (plus the label drawn above each) and inside markers. */
function insideObstacles(d: StallLayoutData, excludeId: number | null): Rect[] {
  return [
    ...d.annotations.filter((a) => a.hangarId === null && a.id !== excludeId && groundLocation(a, d.ground) !== 'outside'),
    ...d.hangars.map((h) => {
      const label = Math.min(h.width, h.height) * 0.07 * 1.5;
      return { x: h.x - 0.5, y: h.y - label - 0.5, width: h.width + 1, height: h.height + label + 1 };
    }),
  ];
}

function outsideObstacles(d: StallLayoutData, excludeId: number | null): Rect[] {
  return d.annotations.filter((a) => a.hangarId === null && a.id !== excludeId && groundLocation(a, d.ground) !== 'inside');
}

export function validateAnnotation(hangarId: number | null, draft: AnnotationDraft): DraftErrors {
  const d = data();
  if (!d) return { label: 'Generate a ground first.' };
  const errors: DraftErrors = {};
  if (hangarId !== null) {
    const h = d.hangars.find((x) => x.id === hangarId);
    if (!h) return { label: 'Hangar not found.' };
    if (placementRule(draft.type) !== 'inside' && (draft.type === 'road' || draft.type === 'parking')) {
      errors.type = 'Roads and parking belong at ground level, not inside a hangar.';
    }
    if (draft.width > h.width) errors.width = `Exceeds available width (${h.width}).`;
    if (draft.height > h.height) errors.height = `Exceeds available height (${h.height}).`;
    return errors;
  }
  if (wantsOutside(draft)) {
    // The site grows to fit outside items; only guard against absurd sizes.
    const max = maxOutsideSize(d.ground);
    if (draft.width > max + 1e-6) errors.width = `Too large for the site area (max ${max}).`;
    if (draft.height > max + 1e-6) errors.height = `Too large for the site area (max ${max}).`;
    return errors;
  }
  if (draft.width > d.ground.width + 1e-6) errors.width = `Wider than the ground (${d.ground.width}).`;
  if (draft.height > d.ground.height + 1e-6) errors.height = `Taller than the ground (${d.ground.height}).`;
  return errors;
}

/** Where a ground-level annotation should go. Returns the rect plus whether it found a clear spot. */
function placeGroundAnnotation(d: StallLayoutData, draft: AnnotationDraft, excludeId: number | null): { rect: Rect; fits: boolean } {
  const { width, height } = draft;
  if (wantsOutside(draft)) {
    const p = placeBesideGround(draft.side, width, height, draft.gap, d.ground, outsideObstacles(d, excludeId), d.ground.gridSize);
    return { rect: { x: p.x, y: p.y, width, height }, fits: p.fits };
  }
  // Grid-step scan so real free spots (e.g. a strip beside the last hangar) are found.
  const spot = findFreeSpot(width, height, d.ground, insideObstacles(d, excludeId), d.ground.gridSize);
  return { rect: { x: spot.x, y: spot.y, width, height }, fits: spot.fits };
}

/**
 * When editing an outside item beside the same side, keep its position along
 * that side and put its ground-facing edge at the requested gap; otherwise null.
 */
function keepOutsidePosition(existing: LayoutAnnotation, draft: AnnotationDraft, d: StallLayoutData): Rect | null {
  const side = inferSide(existing, d.ground);
  if (!side || side !== draft.side) return null;
  return atGap({ x: existing.x, y: existing.y, width: draft.width, height: draft.height }, side, Math.max(0, draft.gap), d.ground);
}

function overlapsHangar(d: StallLayoutData, r: Rect): boolean {
  return d.hangars.some((h) => rectsOverlap(r, h));
}

/** Real (unpadded) things an inside ground item would visually overlap. */
function overlapsSomethingInside(d: StallLayoutData, r: Rect, excludeId: number | null, blocks: boolean): boolean {
  const markers = d.annotations.filter((a) => a.hangarId === null && a.id !== excludeId && groundLocation(a, d.ground) !== 'outside');
  return markers.some((m) => rectsOverlap(r, m)) || (blocks && overlapsHangar(d, r));
}

/**
 * Add or update an annotation from the form. Returns an error message (and
 * changes nothing) when a parking area / counter has no room inside the
 * ground — it is never dropped on top of a hangar.
 */
export function saveAnnotation(hangarId: number | null, annotationId: number | null, draft0: AnnotationDraft): string | null {
  const d = data();
  if (!d) return 'Generate a ground first.';
  // 4-decimal sizes keep flush edges exact (e.g. 19.68504 ft typed by hand).
  const draft: AnnotationDraft = { ...draft0, width: clean(draft0.width), height: clean(draft0.height), gap: clean(Math.max(0, draft0.gap || 0)) };
  const label = draft.label.trim() || annotationMeta(draft.type).label;
  const existing = annotationId !== null ? d.annotations.find((a) => a.id === annotationId) : undefined;
  const blocks = hangarId === null && blocksHangars({ type: draft.type, hangarId: null });

  let rect: Rect;
  let fits = true;
  let overlapWarning: string | null = null;
  if (hangarId !== null) {
    const hangar = d.hangars.find((h) => h.id === hangarId);
    if (!hangar) return 'Hangar not found.';
    if (existing) {
      rect = {
        x: clamp(existing.x, 0, hangar.width - draft.width),
        y: clamp(existing.y, 0, hangar.height - draft.height),
        width: draft.width,
        height: draft.height,
      };
    } else {
      const obstacles: Rect[] = [
        ...d.annotations.filter((a) => a.hangarId === hangarId),
        ...d.stalls.filter((s) => s.hangarId === hangarId),
      ];
      const spot = findFreeSpot(draft.width, draft.height, hangar, obstacles, d.ground.gridSize);
      rect = { x: spot.x, y: spot.y, width: draft.width, height: draft.height };
      fits = spot.fits;
    }
  } else {
    let kept: Rect | null = null;
    if (existing) {
      const location = groundLocation(existing, d.ground);
      if (wantsOutside(draft)) {
        kept = location === 'outside' ? keepOutsidePosition(existing, draft, d) : null;
      } else if (location === 'inside') {
        kept = {
          x: clamp(existing.x, 0, d.ground.width - draft.width),
          y: clamp(existing.y, 0, d.ground.height - draft.height),
          width: draft.width,
          height: draft.height,
        };
      }
      // The site grows to include stored items, so only the inside/outside rule matters for a kept position.
      const site = kept ? boundingBox([siteBounds(d.ground, d.annotations), kept])! : null;
      if (kept && site && validateGroundAnnotationRect(draft.type, kept, d.ground, site)) kept = null;
      // A parking area / counter must not end up on a hangar: find it a proper spot instead.
      if (kept && blocks && !wantsOutside(draft) && overlapsHangar(d, kept)) kept = null;
    }
    if (kept) {
      rect = kept;
      const overlaps = wantsOutside(draft)
        ? outsideObstacles(d, annotationId).some((o) => rectsOverlap(kept!, o))
        : overlapsSomethingInside(d, kept, annotationId, blocks);
      if (overlaps) overlapWarning = `"${label}" now overlaps another item — drag it clear in Edit layout.`;
    } else {
      const placed = placeGroundAnnotation(d, draft, annotationId);
      rect = placed.rect;
      fits = placed.fits;
    }
  }

  if (!fits && blocks && !wantsOutside(draft)) {
    return `No free space inside the ground for a ${draft.width}×${draft.height} ${annotationMeta(draft.type).label.toLowerCase()} — place it outside the ground or make it smaller.`;
  }
  if (overlapWarning) toast.warning(overlapWarning);
  if (!fits) {
    toast.warning(
      wantsOutside(draft) && hangarId === null
        ? `No clear spot beside the ${sideLabel(draft.side).toLowerCase()} side — placed anyway; it may overlap another item.`
        : 'No free space found — the marker was placed at the top-left and may overlap something.',
    );
  }

  if (existing) {
    store().commit((cur) => ({
      ...cur,
      annotations: cur.annotations.map((a) => (a.id === existing.id ? { ...a, type: draft.type, label, ...rect } : a)),
    }));
    toast.success(`"${label}" updated.`);
    return null;
  }

  const annot: LayoutAnnotation = { id: nextId(d.annotations), type: draft.type, label, ...rect, hangarId };
  store().commit((cur) => ({ ...cur, annotations: [...cur.annotations, annot] }));
  if (hangarId === null) {
    store().selectGround({ kind: 'annotation', id: annot.id });
    if (wantsOutside(draft)) store().requestFit('ground', 'ground');
  } else {
    if (store().editor.hangarId !== hangarId) store().openEditor(hangarId);
    store().setEditorAnnotation(annot.id);
  }
  toast.success(`"${label}" added.`);
  return null;
}

/**
 * Commit an annotation's geometry from a drag/resize. Ground-level items are
 * checked against their placement rule (roads outside, etc.); returns false —
 * and changes nothing — when the drop is invalid, so the canvas snaps back.
 */
export function setAnnotationRect(id: number, rect: Rect): boolean {
  const d = data();
  const a = d?.annotations.find((x) => x.id === id);
  if (!d || !a) return false;
  if (a.x === rect.x && a.y === rect.y && a.width === rect.width && a.height === rect.height) return true;
  if (a.hangarId === null) {
    const error = validateGroundAnnotationRect(a.type, rect, d.ground, siteBounds(d.ground, d.annotations));
    if (error) {
      toast.warning(`${error} Move reverted.`, { id: 'annotation-placement' });
      return false;
    }
    if (blocksHangars(a) && groundLocation(rect, d.ground) === 'inside' && overlapsHangar(d, rect)) {
      toast.warning(
        a.type === 'parking'
          ? "Parking can't sit on top of a hangar — move it to free ground or outside. Move reverted."
          : `${placementName(a.type)} can't sit on top of a hangar — add it inside the hangar (from its Hangar Editor) instead. Move reverted.`,
        { id: 'annotation-placement' },
      );
      return false;
    }
  }
  store().commit((cur) => ({ ...cur, annotations: cur.annotations.map((x) => (x.id === id ? { ...x, ...rect } : x)) }));
  return true;
}

// ── Ground boundary / setback ────────────────────────────────────────────────

/**
 * `points === null` (or fewer than 3) reverts to the plain width×height rectangle.
 * Returns an error message and makes no change if the polygon is invalid; null on success.
 * See domain/site.ts's activeBoundary/setbackViolation and LAYOUT_PHASE1_DECISIONS.md item 2.
 */
export function setGroundBoundary(points: Point[] | null, setbackDistance: number): string | null {
  const d = data();
  if (!d) return 'No layout to update.';
  const boundary = points && points.length >= 3 ? points : undefined;
  if (points && points.length > 0 && points.length < 3) {
    return 'A custom boundary needs at least 3 points.';
  }
  if (boundary && isSelfIntersectingPolygon(boundary)) {
    return 'The boundary is self-intersecting — its edges cross each other.';
  }
  store().commit((cur) => ({ ...cur, ground: { ...cur.ground, boundary, setbackDistance: setbackDistance || undefined } }));
  return null;
}

export function deleteAnnotation(id: number): void {
  const a = data()?.annotations.find((x) => x.id === id);
  if (!a) return;
  confirm(
    'Delete Marker',
    `Delete "${a.label}"? (Ctrl+Z to undo)`,
    () => {
      store().commit((cur) => ({ ...cur, annotations: cur.annotations.filter((x) => x.id !== id) }));
      toast.success(`"${a.label}" deleted.`);
    },
    'danger',
    'Delete',
  );
}
