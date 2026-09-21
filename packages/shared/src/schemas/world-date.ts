import { z } from 'zod';

/**
 * A world calendar date (ADR-0010, DATA-MODEL §3). Zero-based months,
 * one-based days; `order` is the ordinal day and the ONLY field ever sorted
 * or ranged over. Never a JS Date. The `order` companion is derived by the
 * calendar engine in shared/dates (T-3.1) — schemas validate, they don't
 * compute.
 */
export const worldDateSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(0),
  day: z.number().int().min(1),
  hour: z.number().int().min(0).max(23).nullable().default(null),
  minute: z.number().int().min(0).max(59).nullable().default(null),
  order: z.number().int(),
  label: z.string().nullable().default(null),
});
