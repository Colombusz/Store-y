import { isSpoilerLevel, spoilerLevelRank, type SpoilerLevel } from './constants/spoiler-levels';

/**
 * True when content tagged at `contentLevel` may be shown to a viewer whose
 * ceiling is `maxSpoilerLevel`. Comparison is by rank (ADR-0012):
 * public(0) ≤ internal(1) ≤ secret(2).
 */
export function isSpoilerVisible(contentLevel: SpoilerLevel, maxSpoilerLevel: SpoilerLevel): boolean {
  return spoilerLevelRank(contentLevel) <= spoilerLevelRank(maxSpoilerLevel);
}

/** Drops entities whose own spoilerLevel exceeds the viewer's ceiling. */
export function filterBySpoilerLevel<T extends { spoilerLevel: SpoilerLevel }>(
  items: readonly T[],
  maxSpoilerLevel: SpoilerLevel,
): T[] {
  return items.filter((item) => isSpoilerVisible(item.spoilerLevel, maxSpoilerLevel));
}

/**
 * Applies the viewer's spoiler ceiling to one entity (ADR-0012). Returns a
 * deep copy in which every spoiler-gated subtree — any plain object carrying
 * a valid `spoilerLevel` above the ceiling, at any depth — is replaced with
 * null. Array elements are redacted to null in place (indices preserved).
 * Returns null when the entity itself is above the ceiling; callers serving
 * lists should filter with filterBySpoilerLevel first so this cannot happen.
 *
 * Runs server-side in the API and again in the export pipeline
 * (AGENTS.md §3.6) — never client-side only.
 */
export function applySpoilerFilter<T>(entity: T, maxSpoilerLevel: SpoilerLevel): T | null {
  const maxRank = spoilerLevelRank(maxSpoilerLevel);
  return redactValue(entity, maxRank) as T | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function redactValue(value: unknown, maxRank: number): unknown {
  if (Array.isArray(value)) {
    return value.map((element) => redactValue(element, maxRank));
  }
  if (isPlainObject(value)) {
    const level = value.spoilerLevel;
    if (isSpoilerLevel(level) && spoilerLevelRank(level) > maxRank) {
      return null;
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = redactValue(child, maxRank);
    }
    return out;
  }
  return value;
}
