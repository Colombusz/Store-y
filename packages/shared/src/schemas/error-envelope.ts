import { z } from 'zod';
import { errorCodeSchema } from '../constants/error-codes';

/** The standard error envelope every API failure returns (AGENTS.md §9). */
export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()),
});

export const apiErrorEnvelopeSchema = z.object({
  error: apiErrorSchema,
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;
