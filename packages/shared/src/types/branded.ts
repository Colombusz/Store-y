/**
 * Branded identifiers (CONVENTIONS §1) — cheap insurance against passing a
 * worldId where an entityId belongs. Created only through the guards below.
 */
export type WorldId = string & { readonly __brand: 'WorldId' };
export type EntityId = string & { readonly __brand: 'EntityId' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asBrandedId<T>(value: string, brand: (id: string) => T): T {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`invalid id (expected a UUID string): ${value}`);
  }
  return brand(value);
}

export function asWorldId(value: string): WorldId {
  return asBrandedId(value, (id) => id as WorldId);
}

export function asEntityId(value: string): EntityId {
  return asBrandedId(value, (id) => id as EntityId);
}
