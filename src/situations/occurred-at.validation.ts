/**
 * El capturador envía la fecha de ocurrencia como mediodía local en ISO.
 * Comparar contra Date.now() rechaza el mismo día calendario antes de las 12:00.
 */
export function isFutureOccurredAt(occurredAt: Date, now = new Date()): boolean {
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
  return occurredAt.getTime() > endOfToday.getTime();
}
