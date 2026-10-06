import type { LayoutConfigItem, LayoutEvent, Stall, StallLayoutData } from '../domain/types';

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
  /**
   * A repository MAY return the canonical saved copy (e.g. ApiLayoutRepository,
   * whose backend assigns real ids to anything the client sent as new) — the
   * store adopts it in place of local state when one comes back. Repositories
   * that already know the ids are stable (LocalStorage, Memory) just return
   * void; nothing else changes for them.
   */
  save(data: StallLayoutData, events?: LayoutEvent[]): Promise<StallLayoutData | void>;
  /** Discard everything saved. */
  reset(): Promise<void>;
  /** Layout used when the user asks to restore the demo data. */
  getDefaultLayout(): StallLayoutData;

  /**
   * Only implemented by repositories backed by the real Booking module (see
   * ApiLayoutRepository) — LocalStorage/Memory have no real bookings to
   * assign, so callers (store/actions.ts) check for these before using them
   * and fall back to the plain local status/exhibitorName edit otherwise.
   */
  getAssignableBookings?(): Promise<AssignableBooking[]>;
  assignStall?(stallId: number, stallBookingId: number): Promise<Stall>;
  unassignStall?(stallId: number): Promise<Stall>;

  /**
   * Stall/hangar category, status and colour config — global, not scoped to an exhibition.
   * Only ApiLayoutRepository implements this; LocalStorage/Memory callers fall back to the
   * hardcoded defaults in domain/constants.ts (see stallColorFor/stallStatusLabelFor).
   */
  getConfig?(): Promise<LayoutConfigItem[]>;
}

/** Matches Shared.DTOs.Layout.AssignableBookingResponse. */
export interface AssignableBooking {
  stallBookingId: number;
  exhibitorId: number;
  exhibitorName: string;
  companyName: string;
  noOfStalls: number;
  width: number;
  depth: number;
  approvalState: 'pending' | 'approved';
}

export interface LayoutLoadResult {
  data: StallLayoutData | null;
  /** Where the data came from — used for toasts/diagnostics only. */
  source: 'current' | 'migrated' | 'default' | 'empty';
  /** Schema version of the key the data was read from. */
  fromVersion: number | null;
}
