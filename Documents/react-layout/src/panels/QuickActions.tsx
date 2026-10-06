import { Ban, BookmarkCheck, CalendarCheck, Link2, LockOpen, XCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, Input, Select } from '../components/ui';
import { availableBookingActions, BOOKING_ACTIONS, type BookingAction } from '../domain/booking';
import type { Stall } from '../domain/types';
import { assignStallToBooking, canAssignRealBookings, fetchAssignableBookings, runBookingAction } from '../store/actions';
import type { AssignableBooking } from '../repository/LayoutRepository';
import { useLayoutStore } from '../store/layoutStore';

/** Actions that only make sense through the whole-snapshot save (no real-booking equivalent) —
 *  hidden for sales_person, who can view/assign/unassign but not edit layout data. See
 *  src/auth/session.ts's canManageLayout and LAYOUT_RBAC_MATRIX.md. */
const MANAGE_ONLY_ACTIONS: readonly BookingAction[] = ['reserve', 'book', 'block', 'unblock'];

const ICONS: Record<BookingAction, ReactNode> = {
  reserve: <BookmarkCheck size={14} />,
  book: <CalendarCheck size={14} />,
  block: <Ban size={14} />,
  unblock: <LockOpen size={14} />,
  'cancel-reservation': <XCircle size={14} />,
  'cancel-booking': <XCircle size={14} />,
};

const VARIANT: Record<BookingAction, 'primary' | 'success' | 'secondary' | 'danger' | 'warning'> = {
  reserve: 'warning',
  book: 'success',
  block: 'secondary',
  unblock: 'secondary',
  'cancel-reservation': 'danger',
  'cancel-booking': 'danger',
};

function bookingLabel(b: AssignableBooking): string {
  const name = b.companyName || b.exhibitorName || `Exhibitor #${b.exhibitorId}`;
  const size = `${b.noOfStalls} stall${b.noOfStalls === 1 ? '' : 's'}, ${b.width}×${b.depth}`;
  const state = b.approvalState === 'approved' ? '' : ' — pending approval';
  return `${name} (${size})${state}`;
}

/** Assigns an `available` stall to a real, unassigned booking for this
 *  exhibition (GET .../assignable-bookings, POST .../assign) — only rendered
 *  when the repository is API-backed (see canAssignRealBookings). Replaces
 *  the free-text Reserve/Book form for that case: the resulting
 *  reserved-vs-booked status is derived server-side from the booking's own
 *  approval state, not picked by the admin, so there's nothing for Reserve
 *  and Book to mean separately here. */
function AssignBookingPanel({ stall, onDone }: { stall: Stall; onDone: () => void }) {
  const [bookings, setBookings] = useState<AssignableBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAssignableBookings()
      .then((list) => {
        if (!cancelled) setBookings(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const confirm = async () => {
    if (selectedId === '') return;
    setSubmitting(true);
    const ok = await assignStallToBooking(stall.id, selectedId);
    setSubmitting(false);
    if (ok) onDone();
  };

  return (
    <div
      className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2.5"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onDone();
        }
      }}
    >
      <p className="text-xs font-medium text-slate-600">Assign a booking to {stall.stallNo}</p>

      {error && <p className="text-xs text-red-600">Could not load bookings: {error}</p>}

      {!bookings && !error && <p className="text-xs text-slate-500">Loading bookings…</p>}

      {bookings && bookings.length === 0 && <p className="text-xs text-slate-500">No unassigned bookings for this exhibition.</p>}

      {bookings && bookings.length > 0 && (
        <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : '')} aria-label={`Booking to assign to stall ${stall.stallNo}`}>
          <option value="">Choose a booking…</option>
          {bookings.map((b) => (
            <option key={b.stallBookingId} value={b.stallBookingId}>
              {bookingLabel(b)}
            </option>
          ))}
        </Select>
      )}

      <div className="flex justify-end gap-1.5">
        <Button size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={selectedId === '' || submitting} onClick={() => void confirm()}>
          {submitting ? 'Assigning…' : 'Confirm Assign'}
        </Button>
      </div>
    </div>
  );
}

/** Status transitions for one stall. Reserve/Book collect an exhibitor name inline; the rest confirm in a dialog. */
export function QuickActions({ stall }: { stall: Stall }) {
  const [pending, setPending] = useState<BookingAction | 'assign' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const realBookings = canAssignRealBookings();
  const canManage = useLayoutStore((s) => s.canManageLayout);

  useEffect(() => {
    setPending(null);
    setError(null);
  }, [stall.id, stall.status]);

  useEffect(() => {
    if (pending && pending !== 'assign') inputRef.current?.focus();
  }, [pending]);

  const start = (action: BookingAction) => {
    if (BOOKING_ACTIONS[action].needsExhibitor) {
      setPending(action);
      setName(stall.exhibitorName ?? '');
      setError(null);
    } else {
      runBookingAction(stall.id, action);
    }
  };

  const confirm = () => {
    if (!pending || pending === 'assign') return;
    if (!name.trim()) {
      setError('Please enter an exhibitor name.');
      inputRef.current?.focus();
      return;
    }
    if (runBookingAction(stall.id, pending, name)) setPending(null);
  };

  // available + API-backed: a single "Assign" action replaces Reserve/Book —
  // everything else (block, and reserved/booked's own actions) is unchanged.
  const showAssign = stall.status === 'available' && realBookings;
  const buttonActions = availableBookingActions(stall.status).filter(
    (a) => !(showAssign && (a === 'reserve' || a === 'book')) && (canManage || !MANAGE_ONLY_ACTIONS.includes(a)),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Booking actions for stall ${stall.stallNo}`}>
        {showAssign && (
          <Button size="sm" variant="warning" icon={<Link2 size={14} />} onClick={() => setPending('assign')} aria-pressed={pending === 'assign'}>
            Assign
          </Button>
        )}
        {buttonActions.map((a) => (
          <Button key={a} size="sm" variant={VARIANT[a]} icon={ICONS[a]} onClick={() => start(a)} aria-pressed={pending === a}>
            {BOOKING_ACTIONS[a].label}
          </Button>
        ))}
      </div>

      {pending === 'assign' && <AssignBookingPanel stall={stall} onDone={() => setPending(null)} />}

      {pending && pending !== 'assign' && (
        <form
          className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setPending(null);
            }
          }}
        >
          <label htmlFor={inputId} className="text-xs font-medium text-slate-600">
            Exhibitor name — {BOOKING_ACTIONS[pending].label.toLowerCase()} {stall.stallNo}
          </label>
          <Input
            id={inputId}
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            invalid={!!error}
            aria-describedby={error ? `${inputId}-err` : undefined}
            placeholder="Company / exhibitor"
          />
          {error && (
            <p id={`${inputId}-err`} role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-1.5">
            <Button size="sm" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit">
              Confirm {BOOKING_ACTIONS[pending].label}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
