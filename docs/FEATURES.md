# FEATURES — specification & acceptance criteria

Every feature has a stable ID (`F-<AREA>-<n>`). Tasks in [`ROADMAP.md`](./ROADMAP.md) reference these IDs, and a task is not done until the feature's acceptance criteria are demonstrably met.

**Legend:** every checkbox is mandatory; a partially met feature stays open.

---

## Module 1 — World & Map Builder

### F-WORLD-1 — World configuration

A world is the root container. Fields: name, tagline, genre, description, **radius (km)**, day length, axial tilt, rotation speed, default calendar, default units, globe surface settings.

**Rules**
- Radius defaults to Earth's 6371 km and drives *every* area calculation (ADR-0007).
- Changing the radius **must** recompute and persist every region's `areaKm2`, and warn the user first.
- Creating a world seeds a default Gregorian-equivalent calendar so dates work immediately.

**Acceptance criteria**
- [x] `POST /api/v1/worlds` creates a world *and* its default calendar in one transaction.
- [x] Creating a region on a world of radius R yields an area scaled by `(R/R_E)²` exactly (unit test).
- [x] Radius change propagates to all region areas; service test covers the propagation.

### F-MAP-1 — 3D globe rendering

A rotatable, zoomable, pannable 3D globe on which all geographic data is drawn.

**Rules**
- Uses `react-globe.gl` 2.38.0 (ADR-0005). Exactly one globe instance exists app-wide; the route is lazy-loaded.
- Globe surface is procedurally generated from a seed (default), or a user-uploaded equirectangular texture.
- Layer visibility, region colours and the current `asOf` date all affect what is drawn.

**Acceptance criteria**
- [ ] Globe renders with atmosphere and a custom texture; first paint < 2 s on integrated graphics.
- [ ] No WebGL context leak across 10 mount/unmount cycles under React StrictMode.
- [ ] Camera position persists across route changes within a session.
- [ ] All imperative ref calls are gated behind `onGlobeReady`; no null-ref errors in console.

### F-MAP-2 — Region painting (hex authoring)

The primary way to define a region: paint H3 cells on the globe.

**Rules**
- Working resolution is chosen per tier: continent ≈ 2–3, country ≈ 4–5, city/district ≈ 6–7 (ADR-0006).
- Interactions: click toggles a cell, drag paints continuously, shift-drag erases, `[` / `]` step resolution.
- A paint session is a **draft** in `useMapStore`, committed in a single request (`POST /api/v1/regions/bulk/cells`) — never cell-by-cell.
- The UI shows a live running total: cell count, measured area, and delta since the last commit.
- Painting over a cell owned by another region is blocked by default (configurable repaint).

**Acceptance criteria**
- [ ] Committing 50 contiguous painted cells produces one region with `cellCount = 50` and `areaKm2` equal to the sum of exact `cellArea` values (server test).
- [ ] Drag-painting across 200+ cells stays responsive at res 5 (no dropped input).
- [ ] Erasing mid-draft then committing stores the correct final set; `compactCells` round-trips losslessly.
- [ ] Cancelling a paint session leaves no server state behind.

### F-MAP-3 — Region hierarchy

Regions nest: continent → country → province/state → city → district. Any region may also be a sibling.

**Rules**
- `parentId` is self-referential; the service **rejects cycles** (`REGION_PARENT_CYCLE`).
- A child's cells must lie inside the parent's cells; violations return `REGION_OUTSIDE_PARENT` listing the offending cells.
- Deleting a parent with children requires an explicit `strategy` (`reparent` | `cascade`); the bare delete is refused.

**Acceptance criteria**
- [ ] Cycle creation is rejected with a stable error code, covered by a test.
- [ ] A child wholly outside its parent is rejected; a partially outside child reports which cells are invalid.
- [ ] Nesting to depth ≥ 5 works and renders without recursion problems.

**Acceptance criteria**
- [ ] Cycle creation is rejected with a stable error code, covered by a test.
- [ ] A child wholly outside its parent is rejected; a partially outside child reports which cells are invalid.
- [ ] Nesting to depth ≥ 5 works and renders without recursion problems.

### F-MAP-4 — Measured area and target-area fitting

Every region reports a real, unit-switchable area; users may specify a target area.

**Rules**
- Area source of truth is `Σ cellArea(cell, km2)` scaled by `(R_world/R_E)²` (ADR-0007); `@turf/area` is the cross-check.
- Display in km² / mi² / hectares per world setting, with sensible significant figures.
- **Target fitting:** the user enters an area; the app picks the finest resolution whose average cell area ≤ target/25, then grows or shrinks the painted set until within ±2 % of the target.

**Acceptance criteria**
- [ ] A 500 km-radius circular region measures 784 905 km² ± 1 % on an Earth-radius world (regression test).
- [ ] The same region on a 12 742 km-radius world measures ≈ 4× that area.
- [ ] Target fitting to 12 000 km², 500 000 km² and 9 000 000 km² converges within ±2 % in the tested cases.
- [ ] Switching display units changes only the display — never stored values.

### F-MAP-5 — Freeform polygon mode (advanced)

Draw organic coastlines freehand; the polygon is rasterised to cells on save.

**Rules**
- Vertices are captured by ray–sphere intersection (ADR-0005; pitfall §11.8) and previewed as geodesic edges.
- Self-intersecting rings are rejected before rasterisation (`POLYGON_SELF_INTERSECTS`).
- On save, `polygonToCells` rasterises the ring, so the region joins the same area/border system as painted regions.
- The pre-rasterisation ring is retained as `sourceGeometry` so the user can re-edit it.

**Acceptance criteria**
- [ ] A 6-vertex polygon drawn over open ocean renders as a region with a correct measured area.
- [ ] Rasterisation error against the drawn shape is < 2 % at res 5 for a convex test shape.
- [ ] Re-editing `sourceGeometry` and re-saving updates geometry, cells and area together, in one transaction.

### F-MAP-6 — Points of interest (places)

Named points inside a region: settlements, ruins, temples, battlefields, portals.

**Rules** — a place has a name, kind, lat/lng, optional altitude offset, description, and a region link (derived from containment, overridable). Rendered via `pointsData`/`labelsData`, clickable, and linkable to articles and scenes.

**Acceptance criteria**
- [ ] Creating a place by clicking the globe stores lat/lng within 0.5° of a programmatically computed reference point.
- [ ] A place is auto-assigned to the region whose cells contain it, and can be manually re-assigned.
- [ ] 50 places render as labels without overlapping at default zoom.

### F-MAP-7 — Region profile (vegetation, biome, climate)

The structured worldbuilding fields attached to a region, so "what grows here?" is answerable.

**Rules** — one profile per region: biome, climate, terrain tags, **vegetation** (rich text), flora list, fauna list, natural resources, population, government, economy, languages, religions, plus template-defined custom fields. Revegetating a region must not require editing the region itself.

**Acceptance criteria**
- [ ] Saving a profile round-trips every field, including custom fields validated by its template.
- [ ] Region cards can show a biome/vegetation summary without loading the full profile payload.
- [ ] Profiles respect `spoilerLevel` (a secret biome does not leak to a public export).

### F-MAP-8 — Map layers and globe texture

Base surface plus optional overlays (regions, climate, political, trade routes, pins).

**Rules** — layers have a kind, visibility, opacity and z-order stored per world so a writer's map setup persists. A user-uploaded equirectangular texture replaces the procedural surface. Layer state is per-world, not per-session.

**Acceptance criteria**
- [ ] Toggling layers persists across reloads.
- [ ] Uploading a texture applies it to the globe and survives a page reload.
- [ ] Raising a layer does not change any underlying data.

## Module 2 — Lore & Articles

### F-LORE-1 — Articles with templates and custom fields

The general "any description the user wants" system. Every entity can carry lore; articles can also stand alone (deities, magic systems, languages, technologies).

**Rules**
- An article has title, slug, summary, Markdown body, category, tags, spoiler level, and a template.
- A template defines typed custom fields (`text`, `longtext`, `number`, `select`, `multiselect`, `date`, `entityRef`, `image`, `boolean`) with labels, help text, defaults and required flags. Built-in templates ship for: Region, Settlement, Faction, Deity/Religion, Character, Creature, Plant, Language, Magic System, Technology, Item, Event, Culture.
- Custom field values are stored as JSON validated against the template — a template change never silently corrupts data; invalid values are surfaced for repair.
- Articles are linkable from anywhere: `[[Article Title]]` in Markdown resolves to an internal link, and unresolved links are shown as "unwritten" (a to-write list).

**Acceptance criteria**
- [ ] Creating an article with each field type round-trips without loss.
- [ ] Making a template field required flags existing rows as incomplete rather than rejecting them.
- [ ] `[[Unwritten Thing]]` creates a visible to-write entry that resolves once the article exists.
- [ ] Article body Markdown renders identically in the app and in the Markdown/DOCX exports.

### F-LORE-2 — Tags, categories and backlinks

**Rules** — tags are world-scoped and colour-coded, applicable to any entity. Categories form a tree for articles. **Backlinks are automatic**: every entity that links to another appears in its "Referenced by" panel, computed from `EntityLink` plus inline `[[…]]` links.

**Acceptance criteria**
- [ ] Tagging a region and filtering by that tag returns it from every list view.
- [ ] The backlink panel lists every linking entity with type and context after a link is created.
- [ ] Deleting an entity cleans up its links (no orphans) without deleting the target.

### F-LORE-3 — Full-text search

**Rules** — one search box over titles, summaries, bodies, field values and tags, scoped to the current world and filtered by the viewer's spoiler level. Results show entity type, a matched snippet, and a jump link. A MongoDB `$text` index backs it (one per collection, no substring search — see ADR-0014).

**Acceptance criteria**
- [ ] A search for a term appearing only in a custom field value finds the entity.
- [ ] A `secret` entity never appears for a viewer at `public` level.
- [ ] 5 000 articles return results in < 200 ms.

---

## Module 3 — History Maker

### F-HIST-1 — Custom calendar design

Define the world's own reckoning: era name, months and their lengths, week length, leap rules, and display format (F-WORLD-1 extends this).

**Rules** — months are an ordered list with names and day counts; leap rules are expressed generically (`every N years, except every M, unless every K, add D days`), which covers Gregorian, simple, and invented schemes. A live preview shows how a date renders.

**Acceptance criteria**
- [ ] A 400-day year with 10 unequal months saves and renders dates correctly.
- [ ] A leap rule adding one day every 4 years (except every 100) computes the correct `order` across a 400-year span — tested exhaustively.
- [ ] Changing month lengths requires confirmation and recomputes every `order` in the world in one transaction.
- [ ] Negative years (before the epoch) format and sort correctly.

### F-HIST-2 — Eras

Named periods with a start, an optional end, a colour and a description, used to band the timeline and to filter events.

**Acceptance criteria**
- [ ] An era with no end renders as ongoing to the timeline's right edge.
- [ ] Overlapping eras render on separate lanes rather than breaking the layout.
- [ ] Events inherit their era when created inside an era's span (overridable).

### F-HIST-3 — Dated events with cause and consequence

The core of "what kind of history does this world have": a war, a plague, a coronation, a discovery.

**Rules** — an event has a title, summary, body, start (point or span), `isOngoing`, era, location region, importance (1–5), tags, participants (character links), and **cause/consequence links to other events** via `EntityLink`. Cause links form a DAG; cycles are rejected.

**Acceptance criteria**
- [ ] Creating a span event with `isOngoing` renders it open-ended on the timeline and includes it in "active at date X" queries.
- [ ] A cause link appears on both events (as cause and as consequence).
- [ ] A cause cycle is rejected with a stable error code.
- [ ] Events sort correctly across a custom calendar and across negative years.

### F-HIST-4 — Timeline view and time scrubbing

A scrubbable timeline that also drives the rest of the app.

**Rules** — lanes by era, zoom from millennia to days, event cards open a detail panel, and the scrub position publishes `asOf` to the global store. "World at date X" filters every time-aware list. A `?asOf=` URL parameter makes a given moment shareable/bookmarkable.

**Acceptance criteria**
- [ ] Scrubbing updates the event list, character "alive/dead" status and the relationship web within 100 ms at 2 000 events.
- [ ] Zooming out to a millennium view aggregates events by era with a count badge.
- [ ] The scrubber position survives a reload via the URL.
- [ ] 10 000 events remain interactive (virtualised lanes only).

## Module 4 — Characters, Interactions & the Relationship Web

### F-CHAR-1 — Character builder

A character is more than a name and a portrait: it is a bundle of typed, queryable attributes.

**Rules** — fields include name, aliases/titles, portrait (asset), species, gender, pronouns, birth/death dates (**WorldDates**, so age is computable at any `asOf`), status (`alive`/`dead`/`unknown`/`undead`), role (`protagonist`/`antagonist`/`supporting`/`minor`/`historical`), occupation, affiliations (`EntityLink` to factions/regions), appearance, personality, motivation, flaw, backstory, arc summary, voice notes, and **secrets** (a spoiler-level-gated block). Plus a template-driven custom-field block, so a species template can add "number of hearts" without a migration.

**Acceptance criteria**
- [ ] Age at a given `asOf` date is computed from birth/death WorldDates using the world's calendar (not Earth years).
- [ ] A character whose `deathOrder <= asOf` shows as dead; before it, as alive. Scrub past the death date and the status flips.
- [ ] Secrets are invisible at `public` spoiler level, in both the UI and an export.
- [ ] Custom fields from a character template round-trip.

### F-CHAR-2 — Relationships between characters

Typed, directed or symmetric edges with affinity and validity.

**Rules** — `type` ∈ `family` | `romantic` | `ally` | `rival` | `enemy` | `mentor` | `employer` | `friend` | `custom`; `subtype` carries kinship (`father_of`, `sibling_of`, `married_to`). Edges have a base `affinity` (−100…100), a `status` label, and a validity range (WorldDates) so "they were married from 340 to 352" is expressible. Bidirectional, same-type edges are stored once with `isBidirectional = 1`.

**Acceptance criteria**
- [ ] A symmetric edge renders once and is not duplicated when created from either side.
- [ ] Family edges can be visualised as a family tree as well as a web.
- [ ] A relationship that ended before `asOf` does not appear in the web at that date.

### F-INT-1 — The interaction maker

The "general interaction maker": record what actually happened between characters.

**Rules** — an interaction has a title, kind (`scene` | `conversation` | `conflict` | `meeting` | `battle` | `letter` | `flashback` | `custom`), summary and body, a start/end WorldDate (point or span), a region and/or place, an outcome, and **participants** (each with a role, emotional state, personal goal, whether they are the POV, and whether a secret was revealed).

**Acceptance criteria**
- [ ] An interaction with 5 participants saves and lists all roles correctly.
- [ ] An interaction can be attached to a place, and the place's panel lists its interactions chronologically.
- [ ] Interactions are searchable and filterable by kind, date range, participant and location.

### F-INT-2 — Relationship deltas (interactions change relationships)

The mechanism that makes the web *move*.

**Rules** — an interaction embeds zero or more deltas: `(relationshipId, affinityDelta, statusAfter, notes)` inside its own document (never a companion collection, never on the relationship document — see ADR-0016). The displayed state of a relationship at date T is:

```
state(T) = fold(
  base relationship,
  deltas of interactions whose endOrder ≤ T, ordered by endOrder then interaction id
)
```

- Deltas are **additive and ordered**, never destructive: the base is never overwritten, so history is always reconstructible.
- Status overrides (`statusAfter`) replace the label from that point forward.
- The fold lives in `shared` so the UI, the API and exports agree.

**Acceptance criteria**
- [ ] Recording "betrayal" (−40 affinity, status `enemy`) between two allies makes the web show them as enemies *after* that date and allies *before* it.
- [ ] The fold is a pure function with unit tests covering: no deltas, one delta, many unordered deltas, equal `endOrder` (tie-break by id), and a delta after `asOf` (excluded).
- [ ] Deleting an interaction removes its deltas and the relationship reverts accordingly.

### F-INT-3 — Relationship web with timeline scrubbing

The headline visualisation: a force-directed graph of who relates to whom, rewindable in time.

**Rules** — nodes are characters (and optionally factions/regions), edges are relationships coloured and thickened by type and current affinity. A scrubber sets `asOf`, and the graph redraws as it stood then. Selecting a node highlights its neighbourhood; clicking through opens the entity. Filters: relationship types, minimum affinity, only-alive, factions, regions.

**Acceptance criteria**
- [ ] Scrubbing from year 510 to 515 visibly changes edge colours/labels where deltas exist.
- [ ] A world with 200 characters and 400 relationships renders and pans smoothly; layout runs in a worker above 200 nodes.
- [ ] The same date always produces the same layout (fixed seed) — reloading does not reshuffle the graph.
- [ ] Filtering to `enemy` shows only hostile edges and their endpoints.
- [ ] Every edge is inspectable: hovering shows type, current affinity, and the interactions that changed it.

## Module 5 — Story Tracker

This is where the world and the manuscript meet: tracking *what is happening in the story*.

### F-STORY-1 — Stories, arcs, chapters and scenes

**Rules**
- `Story` — title, kind (novel/novella/short/series/screenplay), logline, synopsis, genre, status, target word count.
- `Arc` — kind ∈ `character` | `plot` | `theme`; optionally attached to a character; ordered beats.
- `Chapter` — numbered, with synopsis, POV, primary region, world-date span, status (`outline`→`draft`→`revised`→`final`), word count, Markdown content.
- `Scene` — ordered within a chapter, with summary, POV, region/place, world date, cast, beats, word count, and links to the `Interaction`s it contains.
- **Narrative order and chronological order are separate.** A chapter has a `narrativeOrder` (where it sits in the book) *and* a world date. The UI offers both, because flashbacks and non-linear structure are normal.

**Acceptance criteria**
- [ ] Reordering chapters changes no world date.
- [ ] A story with two flashback chapters is correct in both narrative and chronological views.
- [ ] Word counts are computed on save per scene/chapter/arc/story and match a manual count.
- [ ] Attaching an interaction to a scene links both directions.

### F-STORY-2 — "What's happening" dashboard

The single screen that answers the app's headline question.

**Rules** — for the current `asOf` date and selected scene, show who is present (and alive), where they are, which relationships are currently hostile or warm, recent events, and which threads are open. **Contradiction checks** surface problems: a character in two places at once, a dead character in a later scene, a scene set in a region that does not yet exist.

**Acceptance criteria**
- [ ] The dashboard reflects the scrubbed date, not "now".
- [ ] A scene containing a character whose `deathOrder` precedes it raises a visible warning.
- [ ] A scene placed outside its region's date range raises a warning.
- [ ] Contradiction checks are pure functions with tests.

---

## Module 6 — Export

> "Make sure to create a story exporting after the world building is completed."

### F-EXP-1 — Export profiles and scope

**Rules** — a profile selects format, scope (modules, specific entities, date range, as-of date) and options: `includeSecrets`, spoiler ceiling, units, images, map plates, and **Story Bible** (encyclopaedic, grouped) vs **Manuscript** (prose order) layout. Built-ins: *Reader Bible (public)*, *GM Bible (all secrets)*, *World Geography*, *History & Timeline*, *Manuscript*. Profiles are saved per world.

**Acceptance criteria**
- [ ] The same profile twice on an unchanged world produces identical output (deterministic ordering).
- [ ] Exporting "History only" contains no character sheets.
- [ ] A saved custom profile persists and re-runs.

### F-EXP-2 — Export formats

| Format | Notes |
|--------|-------|
| **Markdown** | One file, or a ZIP with one file per entity plus an index; internal links become relative links. |
| **DOCX** | Heading hierarchy, TOC, embedded images, map plates. Opens cleanly in Word/LibreOffice. |
| **EPUB** | Reader-facing compendium or manuscript, with cover and spine order. |
| **PDF** | Cover and map plates via `pdf-lib` (Phase 5+). Long-form prose PDF is out of scope — the user prints the EPUB/HTML. |
| **GeoJSON** | Regions and places for QGIS or another map tool. |
| **PNG/SVG** | Globe snapshot at a chosen camera and resolution, legend included. |
| **JSON** | Complete project backup for restore and cross-install portability. |

**Acceptance criteria**
- [ ] DOCX opens with a working TOC and inline images.
- [ ] EPUB validates and contains every in-scope entity.
- [ ] GeoJSON loads in an external GIS tool with correct coordinates (no lat/lng swap).
- [ ] A Markdown ZIP drops into Obsidian with every internal link resolving.

### F-EXP-3 — Spoiler-safe export

**Rules** — the pipeline runs `applySpoilerFilter()` server-side with the profile's ceiling **before** rendering. Secret characters, hidden relationships, unrevealed events and gated field groups are *omitted*, not blanked, so documents have no conspicuous gaps.

**Acceptance criteria**
- [ ] A `secret` character never appears in a `public`-profile output in any format (Markdown, DOCX, EPUB, JSON).
- [ ] Reader timelines reveal no future events.
- [ ] `GM Bible` *does* include secrets, proving the flag has an effect.

### F-EXP-4 — Backup, restore and portability

**Rules** — JSON export carries a `schemaVersion` and every referenced asset. Import validates with Zod, reports incompatible versions clearly, and restores into a **new** world id (never clobbering an existing world). Round-tripping must be lossless.

**Acceptance criteria**
- [x] Export → wipe → import gives deep equality for every entity.
- [x] A newer `schemaVersion` fails with an actionable message, not corruption.
- [x] A malformed file is rejected by Zod and leaves the DB untouched.

---

## Cross-cutting features

**F-X-1 — Revision history and undo.** Every mutation writes a `revision`; each entity panel has a History tab with before/after diffs and "restore this version".
*Acceptance:* three name edits list three revisions; restoring the first reverts it and appears as a new revision.

**F-X-2 — Trash and restore.** Soft-deleted entities show in a Trash view by type, restorable individually or in bulk, 30-day retention, explicit "empty trash".
*Acceptance:* deleting a character with relationships restores it with all relationships intact.

**F-X-3 — Command palette.** `Ctrl/Cmd-K` fuzzy-searches every entity plus commands ("New region", "Go to date", "Export…").
*Acceptance:* a keyboard-only user can create and open entities without the mouse.

**F-X-4 — Onboarding.** First run offers "create a world" or "load the demo world", plus a 5-step guide (world → paint → lore → calendar → characters).
*Acceptance:* a new user reaches a painted, named continent in three minutes without external docs.
