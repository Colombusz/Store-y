import { z } from 'zod';

/**
 * Stable SCREAMING_SNAKE_CASE error codes for the standard envelope
 * (AGENTS.md §9). Generic codes only — domain codes (e.g. REGION_PARENT_CYCLE)
 * are appended here by the module that introduces them.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'INTERNAL_ERROR',
  'STALE_WRITE',
  'SCHEMA_VERSION_UNSUPPORTED',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorCodeSchema = z.enum(ERROR_CODES);
