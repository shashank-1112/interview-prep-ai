import type { Stall, StallStatus } from './types';

export type BookingAction = 'reserve' | 'book' | 'block' | 'unblock' | 'cancel-reservation' | 'cancel-booking';

export interface BookingActionMeta {
  label: string;
  target: StallStatus;
  /** Reserve/Book capture an exhibitor name; everything else clears it. */
  needsExhibitor: boolean;
  tone: 'primary' | 'danger' | 'neutral';
  confirmTitle: string;
  confirmMessage: (s: Stall, exhibitor?: string) => string;
  successMessage: (s: Stall, exhibitor?: string) => string;
}

export const BOOKING_ACTIONS: Record<BookingAction, BookingActionMeta> = {
  reserve: {
    label: 'Reserve',
    target: 'reserved',
    needsExhibitor: true,
    tone: 'primary',
    confirmTitle: 'Reserve Stall',
    confirmMessage: (s, n) => `Reserve stall ${s.stallNo} for ${n}?`,
    successMessage: (s, n) => `Stall ${s.stallNo} reserved for ${n}.`,
  },
  book: {
    label: 'Book',
    target: 'booked',
    needsExhibitor: true,
    tone: 'primary',
    confirmTitle: 'Book Stall',
    confirmMessage: (s, n) => `Book stall ${s.stallNo} for ${n}?`,
    successMessage: (s, n) => `Stall ${s.stallNo} booked for ${n}.`,
  },
  block: {
    label: 'Block',
    target: 'blocked',
    needsExhibitor: false,
    tone: 'neutral',
    confirmTitle: 'Block Stall',
    confirmMessage: (s) => `Block stall ${s.stallNo}? It will become unavailable.`,
    successMessage: (s) => `Stall ${s.stallNo} blocked.`,
  },
  unblock: {
    label: 'Unblock',
    target: 'available',
    needsExhibitor: false,
    tone: 'neutral',
    confirmTitle: 'Unblock Stall',
    confirmMessage: (s) => `Unblock stall ${s.stallNo}? It will become available.`,
    successMessage: (s) => `Stall ${s.stallNo} is now available.`,
  },
  'cancel-reservation': {
    label: 'Cancel Reservation',
    target: 'available',
    needsExhibitor: false,
    tone: 'danger',
    confirmTitle: 'Cancel Reservation',
    confirmMessage: (s) => `Cancel reservation for ${s.stallNo} (${s.exhibitorName ?? ''})?`,
    successMessage: (s) => `Reservation for ${s.stallNo} cancelled.`,
  },
  'cancel-booking': {
    label: 'Cancel Booking',
    target: 'available',
    needsExhibitor: false,
    tone: 'danger',
    confirmTitle: 'Cancel Booking',
    confirmMessage: (s) => `Cancel booking for ${s.stallNo} (${s.exhibitorName ?? ''})?`,
    successMessage: (s) => `Booking for ${s.stallNo} cancelled.`,
  },
};

const TRANSITIONS: Record<StallStatus, BookingAction[]> = {
  available: ['reserve', 'book', 'block'],
  reserved: ['book', 'cancel-reservation'],
  booked: ['cancel-booking'],
  blocked: ['unblock'],
};

export function availableBookingActions(status: StallStatus): BookingAction[] {
  return TRANSITIONS[status];
}

export function canApplyBookingAction(stall: Stall, action: BookingAction): boolean {
  return TRANSITIONS[stall.status].includes(action);
}

export function applyBookingAction(stall: Stall, action: BookingAction, exhibitorName?: string): Stall {
  if (!canApplyBookingAction(stall, action)) {
    throw new Error(`Cannot ${action} a ${stall.status} stall.`);
  }
  const meta = BOOKING_ACTIONS[action];
  if (meta.needsExhibitor) {
    const name = exhibitorName?.trim();
    if (!name) throw new Error('Please enter an exhibitor name.');
    return { ...stall, status: meta.target, exhibitorName: name };
  }
  return { ...stall, status: meta.target, exhibitorName: null };
}
