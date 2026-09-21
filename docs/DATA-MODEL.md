# DATA MODEL — MongoDB document store

The documents are the contract. Shapes are enforced by Zod schemas in `backend/src/contract/schemas/`, not by the database — so **every shape change updates the schema, the upgraders and this doc in the same change** (`AGENTS.md` §7).

Modelling rules: [`TECH-DECISIONS.md`](./TECH-DECISIONS.md) ADR-0016 (embedding-first), ADR-0017 (schema evolution), ADR-0018 (no ODM).

---

## 1. Document conventions

| Convention | Rule |
|-----------|------|
| Identity | `_id: string` holding a UUIDv7 (`crypto.randomUUID()`). **Never `ObjectId`** in v1 — strings serialise to JSON and HTTP without special handling, and sort chronologically. |
| World scoping | Every world-owned document carries `worldId: string`. Deleting or exporting a world is a set of simple filters with no joins. |
| Timestamps | `createdAt` / `updatedAt` as ISO-8601 UTC **strings**. System metadata, not world time. |
| World time | **Never** a `Date` column. See §3. |
| Soft delete | `deletedAt: string \| null` on all major documents; queries filter it out unless the caller explicitly asks for trash. |
| Concurrency | `version: number`, incremented on every write; stale `expectedVersion` returns `409 STALE_WRITE`. |
| Spoilers | `spoilerLevel: 'public' \| 'internal' \| 'secret'` wherever an entity can hold secrets. |
| Schema version | `schemaVersion: number` on every persisted document (ADR-0017). Current version is declared once in code per collection. |
| Units | Distances in **km**, areas in **km²**, coordinates in **degrees WGS84**, geometry as GeoJSON `[lng, lat]`. Imperial conversion happens at render time only. |
| Enums | Plain `string` values validated by Zod enums in `shared/constants/` — readable in `mongosh` and cheap to extend. |
| Denormalised names | Documents that reference others keep a `displayName` copy, refreshed by the service on rename inside the same transaction. Hot paths never `$lookup`. |
| Money-free | No prices, no accounts, no payments anywhere. |

### Embed vs reference (enforced, not advised)

| Situation | Pattern |
|-----------|---------|
| Owned, bounded, read with its parent | **Embed** (region profile, interaction participants + deltas, calendar months, arc beats, scene cast) |
| Unbounded growth or queried on its own | **Separate collection** (`revisions`, `entityLinks`, `assets`, `articles`, `historicalEvents`) |
| Trees | **Materialised path** (`ancestorIds: string[]`); one indexed query for a whole subtree |
| Cross-cutting many-to-many | **One `entityLinks` collection**, indexed on both directions |
| Tags | **Embedded `tagIds: string[]`** on each document; `tags` is the vocabulary collection. Tag renames fan out via `updateMany` in a transaction. |

What used to be junction tables (`entityTags`, `sceneCharacters`, `sceneInteractions`, `interactionParticipants`) **no longer exist** — embedding replaces them all.

## 2. Collection map

```
worlds ──1:1── calendars
  │
  ├── regions  (profile embedded; cells embedded up to the cap)
  │     ├── ancestorIds: string[]      (continent → country → province → city)
  │     └── regionCells                (overflow, only beyond 300 000 cells)
  ├── places                           (GeoJSON Point + 2dsphere index)
  ├── mapLayers ──*── assets
  ├── articles ──*── articleTemplates (world or built-in), categories, tags
  ├── entityLinks                      (polymorphic typed edge, indexed both ways)
  ├── calendars ──*── eras ──*── historicalEvents
  ├── characters
  │     ├── relationships              (base + validity range; deltas live in interactions)
  │     └── interactions  (participants[] + deltas[] embedded; endOrder drives the fold)
  ├── stories ──1:*── arcs ──*── chapters ──1:*── scenes
  │        (scene owns interactionIds[] and cast[]; no junction collections)
  ├── exportProfiles ──1:*── exportJobs
  ├── revisions                        (audit / undo for every entity)
  └── schemaMigrations                 (bookkeeping for rare one-off backfills)
```

---

## 3. The date model (`WorldDate` + `order`)

Unchanged from the relational design — this is the single most important modelling decision (ADR-0010). A fantasy date is stored **twice**: as readable components and as a sortable ordinal, but now as a **nested sub-object** instead of prefixed columns.

```jsonc
"start": {
  "year": 512,        // INTEGER. Negative = before the epoch.
  "month": 2,         // 0-based index into the calendar's month list.
  "day": 12,          // 1-based day within that month.
  "hour": null,       // optional intra-day precision
  "minute": null,
  "order": 186204,    // ordinal day number. The ONLY field used for sorting/ranges.
  "label": null       // optional free-text override, e.g. "the Long Winter"
}
```

Derived in `shared/dates/calendar.ts`: `toOrder`, `fromOrder`, `formatWorldDate`, `durationBetween` (verified exhaustively against the Gregorian leap rule and a 400-day/10-month synthetic calendar).

Rules:

- **Zero-based months, one-based days.** Stated here because off-by-one is the likeliest bug in the whole app.
- Every write path that sets a date sub-object **must** set its `order` companion, in the service layer where the calendar is loaded and the transaction is open.
- Changing a calendar's month lengths or leap rule re-computes `order` for every dated document in that world, inside a transaction, after user confirmation.
- Spans also store `end: { … }`; `isOngoing: true` forces `end` to be absent and range queries treat it as +∞.

---

## 4. Core documents

### `worlds`

```jsonc
{
  "_id": "01K…", "worldId": "01K…",          // worldId === _id for the root document
  "schemaVersion": 1,
  "name": "Aetheria", "tagline": "…", "description": "…", "genre": "high fantasy",
  "radiusKm": 6371,                          // drives EVERY area calculation
  "dayLengthHours": 24, "axialTiltDeg": 11.4, "rotationSpeed": 1.0,
  "surfaceSeed": 918273, "surfaceAssetId": null,     // procedural texture or upload override
  "calendarId": "01L…", "defaultUnits": "metric",
  "settings": {}, "displayNames": {},
  "createdAt": "…", "updatedAt": "…", "deletedAt": null, "version": 1,
  "spoilerLevel": "internal"
}
```

Indexes: `{ name: 1 }`.

### `calendars`

```jsonc
{
  "_id": "01L…", "worldId": "01K…", "schemaVersion": 1,
  "name": "The Imperial Reckoning", "epochName": "AE",
  "daysPerYear": 365,
  "months": [ { "name": "Thaw", "days": 31 }, … ],   // embedded, ordered, 0-based
  "weekLength": 7, "weekdayNames": [ "…" ],
  "leapRule": { "everyYears": 4, "exceptEvery": 100, "unlessEvery": 400, "extraDays": 1 },
  "displayFormat": "{day}{ordinal} of {month}, {year} {epoch}",
  "createdAt": "…", "updatedAt": "…", "version": 1
}
```

**Rule:** month day-counts are positive integers and `daysPerYear` must equal `Σ months[].days` (service check + test). The Gregorian calendar is the seeded default row.

Indexes: `{ worldId: 1 }` (unique where the world keeps exactly one calendar in v1).

### `regions` — the flagship document

Everything about a region's space lives in one document: hierarchy path, cell set, derived geometry for the globe, measured area, profile and lore fields.

```jsonc
{
  "_id": "01M…", "worldId": "01K…", "schemaVersion": 1,
  "name": "Ashfall Empire", "slug": "ashfall-empire", "kind": "country",
  "color": "#8a2be2",
  "parentId": "01N…", "ancestorIds": ["01N…"],   // materialised path; [] for continents
  "h3Resolution": 5,
  "cells": ["85283473fffffff", …],               // compacted; ABSENT beyond 300 000 (see ADR-0016)
  "cellCount": 2848,
  "geometry": { "type": "MultiPolygon", "coordinates": [ … ] },  // [lng,lat], derived
  "sourceGeometry": { "type": "Polygon", … },    // pre-rasterisation ring (freeform regions)
  "areaKm2": 785339, "targetAreaKm2": 800000,    // measured vs intent
  "bbox": [ -12.4, 40.1, 8.9, 55.6 ], "centroid": [ -2.1, 47.3 ],
  "polygonAltitude": 0.01, "sortOrder": 0, "summary": "…",
  "profile": {                                   // embedded region profile (F-MAP-7)
    "biome": "temperateSteppe", "climate": "continental",
    "terrainTags": ["volcanic", "riverine"],
    "vegetation": "Ash grasslands give way to…",     // rich text — the vegetation requirement
    "flora": [{ "name": "Embergrass", "note": "…" }],
    "fauna": [{ "name": "Cinderwolf", "note": "…" }],
    "naturalResources": ["obsidian", "sulphur"],
    "population": 4200000, "government": "…", "economy": "…",
    "languages": ["Ashen"], "religions": ["The Cinder Faith"],
    "customFields": {}, "spoilerLevel": "internal"
  },
  "spoilerLevel": "internal",
  "validFrom": null, "validTo": null,           // WorldDate sub-objects; borders over history (T-6.4)
  "createdAt": "…", "updatedAt": "…", "deletedAt": null, "version": 3
}
```

Indexes (`backend/src/db/indexes.ts`, applied by `npm run db:indexes`):

```ts
regions: [
  { key: { worldId: 1, parentId: 1 } },
  { key: { worldId: 1, ancestorIds: 1 } },        // subtree queries — verified
  { key: { worldId: 1, kind: 1 } },
  { key: { worldId: 1, areaKm2: 1 } },
  { key: { worldId: 1, slug: 1 }, unique: true,  // see the slug caveat below
    partialFilterExpression: { slug: { $type: 'string' } } },
  { key: { geometry: '2dsphere' } },              // $geoIntersects / $geoWithin — verified
]
```

**The `sparse` trap (caught by testing, not theory).** `sparse: true` on a *compound* unique index only skips documents when **all** indexed fields are missing — since `worldId` is always present, every slug-less document still indexed as `slug: null` and the second one failed with `E11000`. Verified crash, verified fix: use `partialFilterExpression: { slug: { $type: 'string' } }` instead, which excludes slug-less documents from the index entirely. This is now pitfall §11.2 in `AGENTS.md`.

**Service invariants:** no parent cycles; a child's cells ⊆ parent's cells (verified against the `2dsphere`/cell index, not a geometric solver); cells owned by exactly one region unless repaint is explicit; `areaKm2` always equals the recomputed value for `cells` + `radiusKm`; renaming a region fans out its `displayName` to every referencing document in the same transaction.

### `regionCells` — companion collection for oversized regions

Only used when `cells.length > 300 000` (ADR-0016). One document per region:

```jsonc
{ "_id": "…", "worldId": "01K…", "regionId": "01M…", "schemaVersion": 1,
  "h3Resolution": 8, "cells": [ … ], "cellCount": 812044, "createdAt": "…" }
```

Indexes: `{ regionId: 1 }` (unique). The parent `regions` document keeps `cells: null`, its `cellCount`, and its measured area.

### `places` — points of interest

```jsonc
{ "_id": "01P…", "worldId": "01K…", "schemaVersion": 1,
  "regionId": "01M…",                                  // auto-derived from containment, overridable
  "name": "Emberhold", "slug": "emberhold",
  "kind": "city",
  "location": { "type": "Point", "coordinates": [-2.1, 47.3] },  // GeoJSON [lng,lat]
  "altitudeOffset": 0.02,
  "summary": "…", "description": "…",
  "isRuinOfPlaceId": null, "spoilerLevel": "internal",
  "createdAt": "…", "updatedAt": "…", "deletedAt": null, "version": 1 }
```

Indexes: `{ worldId: 1, regionId: 1 }`, `{ location: '2dsphere' }` — "which region contains this point" and "all places within this view" are spatial queries, not application code.

**Rule:** region assignment is derived with a `$geoIntersects` point-in-polygon query against the region's `geometry`, then overridable. A `place.kind` vocabulary (city, town, fortress, ruin, temple, landmark, battlefield, portal, custom) lives in `shared/constants/`.

---

## 5. Lore documents

### `articles` (+ FTS via `$text`)

```jsonc
{ "_id": "01A…", "worldId": "01K…", "schemaVersion": 1,
  "templateId": "01T…", "categoryId": "01C…",
  "title": "The Cinder Faith", "slug": "cinder-faith", "summary": "…",
  "body": "… [[Emberhold]] …",                       // Markdown; [[…]] links resolve
  "customFields": { "founder": "…", "holyDay": { "year": 300, "month": 5, "day": 1, "order": 109001 } },
  "tagIds": ["01G…"], "isStub": false,
  "spoilerLevel": "internal",
  "createdAt": "…", "updatedAt": "…", "deletedAt": null, "version": 2 }
```

**Full-text search** is a `$text` index over `{ title: 'text', body: 'text' }` (verified working). One text index per collection, no substring search — F-LORE-3 is specified against exactly these limits.

Indexes: `{ worldId: 1, slug: 1 }` (unique + partial, same `slug` caveat), `{ worldId: 1, templateId: 1 }`, `{ worldId: 1, categoryId: 1 }`, `{ worldId: 1, tagIds: 1 }`, `{ title: 'text', body: 'text' }`.

### `articleTemplates`, `categories`, `tags`

- `articleTemplates` — `_id`, `worldId` (`null` = built-in for all worlds), `name`, `icon`, `appliesTo` (`article` | `region` | `character` | `event` | …), `fieldDefs: [{ key, label, type, required, default, options?, help? }]`, `isBuiltin`. Built-ins are copy-on-write per world.
- `categories` — `_id`, `worldId`, `name`, `parentId` (tree), `sortOrder`, `icon`.
- `tags` — `_id`, `worldId`, `name` (unique per world), `color`. Documents reference them via embedded `tagIds`, **not** a junction collection. Rename = one `updateMany` per collection in a transaction.

### `entityLinks` — the polymorphic edges

The backbone of backlinks, causes, affiliations and every "related" panel — traverseable from either end.

```jsonc
{ "_id": "01E…", "worldId": "01K…", "schemaVersion": 1,
  "source": { "type": "character", "id": "01H…", "displayName": "Mira" },
  "target": { "type": "region",    "id": "01M…", "displayName": "Ashfall Empire" },
  "relationType": "member_of", "label": "Sworn Shield of", "strength": 0.8,
  "notes": "…", "validFrom": null, "validTo": null,       // WorldDate sub-objects
  "spoilerLevel": "internal",
  "createdAt": "…", "updatedAt": "…", "deletedAt": null, "version": 1 }
```

Indexes: `{ worldId: 1, 'source.type': 1, 'source.id': 1 }`, `{ worldId: 1, 'target.type': 1, 'target.id': 1 }`, `{ worldId: 1, relationType: 1 }`.

**Rule:** `relationType` comes from a controlled vocabulary and valid pairs (e.g. `parent_of` only between characters) are declared in `shared/constants/relation-rules.ts`. Deleting an endpoint cleans up its links in the service — never orphans.

---

## 6. History documents

### `eras`

```jsonc
{ "_id": "01R…", "worldId": "01K…", "schemaVersion": 1,
  "name": "The Ashen Centuries", "description": "…", "color": "#b34700",
  "start": { "year": 400, "month": 0, "day": 1, "order": 145701 },
  "end": null,                                   // absent = ongoing to the timeline's right edge
  "sortOrder": 2, "spoilerLevel": "internal",
  "createdAt": "…", "updatedAt": "…", "version": 1 }
```

Indexes: `{ worldId: 1, 'start.order': 1 }`.

### `historicalEvents`

```jsonc
{ "_id": "01V…", "worldId": "01K…", "schemaVersion": 1,
  "eraId": "01R…",                             // auto-assigned from the span, overridable
  "title": "The Burning of the Skybridge", "summary": "…", "body": "…",
  "start": { "year": 512, "month": 2, "day": 12, "order": 186204 },
  "end":   { "year": 512, "month": 2, "day": 14, "order": 186206 },
  "isOngoing": false,
  "locationRegionId": "01M…", "locationPlaceId": "01P…",
  "importance": 5, "tagIds": ["01G…"], "spoilerLevel": "internal",
  "createdAt": "…", "updatedAt": "…", "deletedAt": null, "version": 1 }
```

Causality lives in `entityLinks` (`relationType` ∈ `caused` | `consequence_of`), so a cause chain is a graph traversal and cycles are rejected in the service.

Indexes: `{ worldId: 1, 'start.order': 1 }`, `{ worldId: 1, 'end.order': 1 }`, `{ worldId: 1, eraId: 1 }`.

---

## 7. People documents

### `characters`

Affiliations (faction, region, order) are **not** fields — they are `entityLinks` with `relationType: 'member_of'`, which is why they can carry validity ranges ("was a member of the Night Guard from 340 to 344").

```jsonc
{ "_id": "01H…", "worldId": "01K…", "schemaVersion": 1,
  "name": "Mira Vess", "slug": "mira-vess",
  "aliases": ["The Cartographer", "Mira of the Ashen Fold"],
  "portraitAssetId": "01S…",
  "species": "human", "gender": "woman", "pronouns": "she/her",
  "birth": { "year": 482, "month": 4, "day": 3, "order": 175301 },
  "death": null,                                     // birth/death orders drive age and alive/dead
  "status": "alive", "role": "protagonist", "occupation": "mapmaker",
  "appearance": "…", "personality": "…", "motivation": "…", "flaw": "…",
  "backstory": "…", "arc": "…", "voiceNotes": "…",
  "secrets": "She burned the first map herself.",    // spoiler-gated block (ADR-0012)
  "customFields": {}, "tagIds": [], "spoilerLevel": "internal",
  "createdAt": "…", "updatedAt": "…", "deletedAt": null, "version": 1 }
```

Indexes: `{ worldId: 1, slug: 1 }` (unique + partial, same `slug` caveat), `{ worldId: 1, status: 1 }`, `{ worldId: 1, role: 1 }`.

### `relationships` — base record only; deltas live in interactions

```jsonc
{ "_id": "01J…", "worldId": "01K…", "schemaVersion": 1,
  "from": { "id": "01H…", "displayName": "Mira Vess" },
  "to":   { "id": "01I…", "displayName": "Vess Marlowe" },
  "type": "romantic", "subtype": "married_to", "isBidirectional": true,
  "baseAffinity": 60, "status": "married",            // NEVER overwritten by deltas
  "start": { "year": 505, … }, "end": null,
  "notes": "…", "spoilerLevel": "internal",
  "createdAt": "…", "updatedAt": "…", "deletedAt": null, "version": 1 }
```

**Uniqueness rule:** at most one active relationship per `(from, to, type)` triple — enforced in the service (validity-range overlap is a service check, not an index) rather than silently merged.

Indexes: `{ worldId: 1, 'from.id': 1 }`, `{ worldId: 1, 'to.id': 1 }`, `{ worldId: 1, type: 1 }`.

### `interactions` — participants and deltas embedded (the fold's source)

The table that makes the web time-travelable. Everything an interaction changes is stored *inside* it, so deleting an interaction reverts its effects and no cascade bookkeeping exists.

```jsonc
{ "_id": "01D…", "worldId": "01K…", "schemaVersion": 1,
  "title": "The Burning of the Skybridge", "kind": "conflict",
  "summary": "…", "body": "…",
  "start": { "year": 512, "month": 2, "day": 12, "order": 186204 },
  "end":   { "year": 512, "month": 2, "day": 14, "order": 186206 },
  "regionId": "01M…", "placeId": "01P…",
  "outcome": "…", "povCharacterId": "01H…",
  "sceneId": null,                                   // set when written into the manuscript
  "participants": [                                   // embedded — bounded by the cast
    { "characterId": "01H…", "displayName": "Mira", "role": "saboteur",
      "emotionalState": "resolute", "goal": "…",
      "secretRevealed": null, "isPov": true, "sortOrder": 0 }
  ],
  "deltas": [                                         // embedded — bounded per interaction
    { "relationshipId": "01J…", "affinityDelta": -40,
      "statusAfter": "enemy", "notes": "She learns of the betrayal." }
  ],
  "spoilerLevel": "internal",
  "createdAt": "…", "updatedAt": "…", "deletedAt": null, "version": 1 }
```

**Fold rule (implemented in `shared`, not in the query).** Load base relationships; load interactions with `end.order <= asOf` ordered by `(end.order, _id)`; apply each interaction's `deltas` additively to `baseAffinity`; the last non-null `statusAfter` wins. Unit tests cover: no deltas, one delta, many unordered deltas, equal `end.order` (tie-break by `_id`), and a delta after `asOf` (excluded).

Indexes: `{ worldId: 1, 'end.order': 1 }` (the fold's read path), `{ worldId: 1, 'start.order': 1 }`, `{ worldId: 1, kind: 1 }`, `{ worldId: 1, regionId: 1 }`, `{ worldId: 1, 'participants.characterId': 1 }`.

---

## 8. Story documents

`stories` — `_id`, `worldId`, `title`, `kind` (`novel` | `novella` | `short` | `series` | `screenplay`), `logline`, `synopsis`, `genre`, `status`, `targetWordCount`, `spoilerLevel`, timestamps, `deletedAt`, `version`. Index: `{ worldId: 1 }`.

`arcs` — `_id`, `storyId`, `worldId`, `name`, `kind` (`character` | `plot` | `theme`), `characterId` (nullable), `description`, `beats: [{ order, label, sceneId? }]` (embedded), `sortOrder`, `version`. Index: `{ storyId: 1, sortOrder: 1 }`.

`chapters` — `_id`, `storyId`, `worldId`, `number`, `title`, `synopsis`, `povCharacterId`, `regionId`, `start`/`end` (WorldDate sub-objects), `narrativeOrder` (**position in the book — separate from world date**), `status`, `content`, `wordCount` (recomputed on save), `version`. Unique on `(storyId, narrativeOrder)`. Indexes: `{ storyId: 1, narrativeOrder: 1 }` (unique), `{ storyId: 1, 'start.order': 1 }` (chronological view).

`scenes` — `_id`, `chapterId`, `storyId`, `worldId`, `narrativeOrder`, `title`, `summary`, `povCharacterId`, `regionId`, `placeId`, `start`/`end`, `status`, `beats` (embedded), `content`, `wordCount`, `cast: [{ characterId, displayName, role }]` (embedded — replaces `sceneCharacters`), `interactionIds: [string]` (embedded — replaces `sceneInteractions`), `spoilerLevel`, timestamps, `version`.

Indexes: `{ chapterId: 1, narrativeOrder: 1 }`, `{ storyId: 1, 'start.order': 1 }`, `{ storyId: 1, 'cast.characterId': 1 }`, `{ storyId: 1, interactionIds: 1 }`.

**Why both `scenes.start.order` and `interactions.end.order` exist:** a scene is a *narrative* unit (where the prose lives); an interaction is a *world* unit (what happened between people). A scene typically contains one or more interactions, and only interactions carry relationship deltas. The reverse link (`interactions.sceneId`) is maintained by the service on attach/detach, in the same transaction.

---

## 9. System documents

| Collection | Shape | Purpose |
|-----------|-------|---------|
| `assets` | `_id`, `worldId`, `kind` (`texture`\|`portrait`\|`mapOverlay`\|`document`\|`audio`\|`other`), `filename`, `path`, `mime`, `bytes`, `width`, `height`, `checksum`, `altText`, `createdAt` | Content-addressed files on disk; dedupe by `checksum`. Index: `{ worldId: 1 }`, `{ checksum: 1 }`. |
| `mapLayers` | `_id`, `worldId`, `name`, `kind`, `assetId`, `geojson`, `isVisible`, `opacity`, `zIndex`, `params` | Per-world map presentation that persists (F-MAP-8). Index: `{ worldId: 1, zIndex: 1 }`. |
| `revisions` | `_id`, `worldId`, `entityType`, `entityId`, `action`, `before`, `after`, `actorId`, `createdAt` | Audit trail + undo + entity history. Index: `{ worldId: 1, entityType: 1, entityId: 1, createdAt: -1 }`. |
| `exportProfiles` | `_id`, `worldId`, `name`, `format`, `scope`, `options`, `isBuiltin` | Saved export configurations (F-EXP-1). |
| `exportJobs` | `_id`, `worldId`, `profileId`, `format`, `status`, `outputPath`, `error`, `bytes`, `createdAt`, `completedAt` | Large exports run out-of-band; the request returns immediately. |
| `schemaMigrations` | `_id`, `collection`, `fromVersion`, `toVersion`, `ranAt`, `stats` | Bookkeeping for rare explicit backfills (ADR-0017). |
| `users`, `sessions` | — | **Phase 6 only.** Single-user installs run without them. |

---

## 10. Transactions

Any write that touches **more than one document** runs inside a driver session (`session.withTransaction`) — available because the server is a replica set (ADR-0015). The canonical cases:

| Operation | Documents written atomically |
|-----------|------------------------------|
| Commit a painted region | `regions` upsert + `worlds` area totals + `revisions` row |
| Rename an entity | The entity + `displayName` fan-out across referencing documents + `revisions` row |
| Delete an entity | The entity (soft) + `entityLinks` cleanup + region reassignment where applicable |
| Attach an interaction to a scene | The scene's `interactionIds` + the interaction's `sceneId` |
| Import a project | Every document of the new world (single import transaction, rolled back on any failure) |
| Calendar change | The calendar + every dated document's recomputed `order` in that world |

Single-document writes (editing an article, recording a participant's mood) need no session — MongoDB guarantees atomicity per document.

**Testing rule.** Every test that exercises a transaction runs against the single-node replica set (`mongodb://…?replicaSet=rs0`). A plain standalone `mongod` makes these tests fail in a confusing way — this is pitfall §11.6 in `AGENTS.md`.

---

## 11. Backup / export file format

A single JSON document (optionally zipped with an `assets/` folder). Documents serialise as-is — there is almost no impedance mismatch, which is one of the reasons the project chose a document store:

```jsonc
{
  "schemaVersion": 1,                // export format version; import refuses to guess
  "kind": "storey-project",
  "exportedAt": "2026-09-21T12:00:00Z",
  "app": { "name": "store-y", "version": "0.5.0" },
  "world": { /* worlds document */ },
  "calendars": [...], "regions": [...], "regionCells": [...], "places": [...],
  "articles": [...], "articleTemplates": [...], "categories": [...], "tags": [...],
  "entityLinks": [...],
  "eras": [...], "historicalEvents": [...],
  "characters": [...], "relationships": [...], "interactions": [...],
  "stories": [...], "arcs": [...], "chapters": [...], "scenes": [...],
  "mapLayers": [...], "assets": [ /* metadata + relative paths in assets/ */ ],
  "revisions": [ /* optional, excluded by default to keep backups small */ ]
}
```

**Import rules**

1. Validate the whole file with a Zod schema **before** writing anything.
2. Reject unknown `schemaVersion` values with `EXPORT_VERSION_UNSUPPORTED` and a message naming the version.
3. Remap every `_id` on import (fresh UUIDv7s) so restoring never collides with existing documents, and rewrite all foreign keys in the same transaction.
4. Import runs in one transaction — a failure leaves the database untouched.
5. `regionCells` companions re-attach by the remapped `regionId`.
