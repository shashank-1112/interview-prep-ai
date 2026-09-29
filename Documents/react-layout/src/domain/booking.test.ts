import { applyBookingAction, availableBookingActions } from './booking';
import type { Stall } from './types';

const stall: Stall = {
  id: 1, hangarId: 1, stallNo: 'A-01', stallCode: 'A-01', stallType: 'Standard',
  x: 0, y: 0, width: 3, height: 3, area: 9, basePrice: 1, finalPrice: 1, status: 'available', exhibitorName: null,
};

describe('booking workflow', () => {
  it('exposes the right quick actions per status', () => {
    expect(availableBookingActions('available')).toEqual(['reserve', 'book', 'block']);
    expect(availableBookingActions('reserved')).toEqual(['book', 'cancel-reservation']);
    expect(availableBookingActions('booked')).toEqual(['cancel-booking']);
    expect(availableBookingActions('blocked')).toEqual(['unblock']);
  });

  it('reserve → book → cancel', () => {
    const r = applyBookingAction(stall, 'reserve', '  Acme  ');
    expect(r).toMatchObject({ status: 'reserved', exhibitorName: 'Acme' });
    const b = applyBookingAction(r, 'book', 'Acme');
    expect(b.status).toBe('booked');
    expect(applyBookingAction(b, 'cancel-booking')).toMatchObject({ status: 'available', exhibitorName: null });
  });

  it('requires an exhibitor name and rejects invalid transitions', () => {
    expect(() => applyBookingAction(stall, 'book', ' ')).toThrow(/exhibitor name/);
    expect(() => applyBookingAction(stall, 'unblock')).toThrow(/Cannot unblock/);
    expect(applyBookingAction(applyBookingAction(stall, 'block'), 'unblock').status).toBe('available');
  });
});
