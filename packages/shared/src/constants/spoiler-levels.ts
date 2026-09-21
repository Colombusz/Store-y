import { z } from 'zod';

export const SPOILER_LEVELS = ['public', 'internal', 'secret'] as const;
export type SpoilerLevel = (typeof SPOILER_LEVELS)[number];

export const spoilerLevelSchema = z.enum(SPOILER_LEVELS);

/** Default for authored entities (AGENTS.md §9 / ADR-0012). */
export const DEFAULT_ENTITY_SPOILER_LEVEL: SpoilerLevel = 'internal';
/** Default ceiling for reader-facing exports (ADR-0012). */
export const DEFAULT_EXPORT_SPOILER_LEVEL: SpoilerLevel = 'public';

const SPOILER_LEVEL_RANK: Record<SpoilerLevel, number> = {
  public: 0,
  internal: 1,
  secret: 2,
};

/** public(0) < internal(1) < secret(2). Filtering compares ranks, never strings. */
export function spoilerLevelRank(level: SpoilerLevel): number {
  return SPOILER_LEVEL_RANK[level];
}

export function isSpoilerLevel(value: unknown): value is SpoilerLevel {
  return typeof value === 'string' && (SPOILER_LEVELS as readonly string[]).includes(value);
}
