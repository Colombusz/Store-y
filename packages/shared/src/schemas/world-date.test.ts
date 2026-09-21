import { describe, expect, it } from 'vitest';
import { worldDateSchema } from './world-date';

describe('worldDateSchema', () => {
  it('accepts a fully specified date', () => {
    const parsed = worldDateSchema.parse({
      year: 512,
      month: 2,
      day: 12,
      hour: 9,
      minute: 30,
      order: 186204,
      label: 'the Long Winter',
    });
    expect(parsed).toEqual({
      year: 512,
      month: 2,
      day: 12,
      hour: 9,
      minute: 30,
      order: 186204,
      label: 'the Long Winter',
    });
  });

  it('defaults optional precision fields to null', () => {
    const parsed = worldDateSchema.parse({ year: 400, month: 0, day: 1, order: 145701 });
    expect(parsed).toEqual({
      year: 400,
      month: 0,
      day: 1,
      hour: null,
      minute: null,
      order: 145701,
      label: null,
    });
  });

  it('allows negative years for dates before the epoch', () => {
    expect(worldDateSchema.safeParse({ year: -12000, month: 0, day: 1, order: -4380000 }).success).toBe(true);
  });

  it('rejects a zero day (days are one-based)', () => {
    expect(worldDateSchema.safeParse({ year: 512, month: 2, day: 0, order: 186192 }).success).toBe(false);
  });

  it('rejects a negative month (months are zero-based)', () => {
    expect(worldDateSchema.safeParse({ year: 512, month: -1, day: 1, order: 186192 }).success).toBe(false);
  });
});
