import type { StallLayoutData } from '../domain/types';

/**
 * Storage boundary for layouts. Components never talk to storage directly —
 * they call store actions, which call this interface. Swap the implementation
 * (REST, SignalR, IndexedDB…) in `main.tsx` without touching component code.
 *
 * All methods are async so network-backed implementations fit unchanged.
 */
export interface LayoutRepository {
  /** Returns the saved layout, `null` when nothing is saved (cleared/blank). */
  load(): Promise<LayoutLoadResult>;
  save(data: StallLayoutData): Promise<void>;
  /** Discard everything saved. */
  reset(): Promise<void>;
  /** Layout used when the user asks to restore the demo data. */
  getDefaultLayout(): StallLayoutData;
}

export interface LayoutLoadResult {
  data: StallLayoutData | null;
  /** Where the data came from — used for toasts/diagnostics only. */
  source: 'current' | 'migrated' | 'default' | 'empty';
  /** Schema version of the key the data was read from. */
  fromVersion: number | null;
}
