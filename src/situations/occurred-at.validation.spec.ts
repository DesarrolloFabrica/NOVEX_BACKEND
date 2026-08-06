import { isFutureOccurredAt } from './occurred-at.validation';

describe('isFutureOccurredAt', () => {
  const now = new Date('2026-08-06T13:43:00.000Z');

  it('acepta la fecha de hoy enviada como mediodía local (Colombia UTC-5)', () => {
    const occurredAt = new Date('2026-08-06T17:00:00.000Z');
    expect(isFutureOccurredAt(occurredAt, now)).toBe(false);
  });

  it('rechaza un día calendario posterior', () => {
    const occurredAt = new Date('2026-08-07T17:00:00.000Z');
    expect(isFutureOccurredAt(occurredAt, now)).toBe(true);
  });

  it('acepta cualquier instante dentro del día calendario actual', () => {
    const occurredAt = new Date('2026-08-06T23:59:00.000Z');
    expect(isFutureOccurredAt(occurredAt, now)).toBe(false);
  });
});
