import { Ban, BookmarkCheck, CalendarCheck, LockOpen, XCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, Input } from '../components/ui';
import { availableBookingActions, BOOKING_ACTIONS, type BookingAction } from '../domain/booking';
import type { Stall } from '../domain/types';
import { runBookingAction } from '../store/actions';

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

/** Status transitions for one stall. Reserve/Book collect an exhibitor name inline; the rest confirm in a dialog. */
export function QuickActions({ stall }: { stall: Stall }) {
  const [pending, setPending] = useState<BookingAction | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    setPending(null);
    setError(null);
  }, [stall.id, stall.status]);

  useEffect(() => {
    if (pending) inputRef.current?.focus();
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
    if (!pending) return;
    if (!name.trim()) {
      setError('Please enter an exhibitor name.');
      inputRef.current?.focus();
      return;
    }
    if (runBookingAction(stall.id, pending, name)) setPending(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Booking actions for stall ${stall.stallNo}`}>
        {availableBookingActions(stall.status).map((a) => (
          <Button key={a} size="sm" variant={VARIANT[a]} icon={ICONS[a]} onClick={() => start(a)} aria-pressed={pending === a}>
            {BOOKING_ACTIONS[a].label}
          </Button>
        ))}
      </div>
      {pending && (
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
