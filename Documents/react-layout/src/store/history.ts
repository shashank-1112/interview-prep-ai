import { HISTORY_LIMIT } from '../domain/constants';

/**
 * Snapshot history. Layout data is immutable, so a snapshot is just a
 * reference to the previous object — O(1) memory per step for unchanged parts.
 */
export interface History<T> {
  past: T[];
  future: T[];
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

export function pushHistory<T>(h: History<T>, current: T, limit = HISTORY_LIMIT): History<T> {
  const past = [...h.past, current];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, future: [] };
}

export function undoHistory<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.past.length === 0) return null;
  const value = h.past[h.past.length - 1]!;
  return { value, history: { past: h.past.slice(0, -1), future: [current, ...h.future] } };
}

export function redoHistory<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.future.length === 0) return null;
  const value = h.future[0]!;
  return { value, history: { past: [...h.past, current], future: h.future.slice(1) } };
}
