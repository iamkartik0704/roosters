import { describe, expect, it } from 'vitest';
import { pickSlot } from '../src/slots';

describe('pickSlot', () => {
  it('returns slot 0 when empty', () => {
    expect(pickSlot(new Map(), 10)).toBe(0);
  });

  it('picks the least-loaded slot, preferring the earliest empty one', () => {
    const counts = new Map([
      [0, 3],
      [1, 1],
      [2, 5],
    ]);
    // slots 3..9 have no jobs yet, so slot 3 is the earliest least-loaded
    expect(pickSlot(counts, 10)).toBe(3);
  });

  it('picks the least-loaded slot within a smaller interval', () => {
    const counts = new Map([
      [0, 3],
      [1, 1],
      [2, 5],
    ]);
    expect(pickSlot(counts, 3)).toBe(1);
  });

  it('prefers the earliest of equally loaded slots', () => {
    const counts = new Map([
      [0, 2],
      [3, 2],
      [7, 2],
    ]);
    expect(pickSlot(counts, 10)).toBe(1);
  });

  it('respects the interval bound (wraps within 0..interval-1)', () => {
    const counts = new Map([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    expect(pickSlot(counts, 3)).toBe(0);
    const empty = pickSlot(new Map(), 1);
    expect(empty).toBe(0);
  });
});
