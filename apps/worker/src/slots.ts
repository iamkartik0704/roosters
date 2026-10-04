/**
 * Slot assignment (plan section 5 "Stagger"): a job is due when
 * (minute mod interval_min) = slot. New jobs take the least-loaded slot so
 * work spreads evenly across minutes.
 */
export function pickSlot(slotCounts: Map<number, number>, intervalMin: number): number {
  let best = 0;
  let bestCount = Infinity;
  for (let s = 0; s < intervalMin; s++) {
    const n = slotCounts.get(s) ?? 0;
    if (n < bestCount) {
      best = s;
      bestCount = n;
    }
  }
  return best;
}
