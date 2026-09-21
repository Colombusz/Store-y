# PLAN — Store-y: Story World Engine

**Status:** planning complete, implementation not started.
**Audience:** the humans and AI agents who will build this.
**Related:** [`FEATURES.md`](./FEATURES.md) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`DATA-MODEL.md`](./DATA-MODEL.md) · [`ROADMAP.md`](./ROADMAP.md) · [`TECH-DECISIONS.md`](./TECH-DECISIONS.md) · [`CONVENTIONS.md`](./CONVENTIONS.md)

---

## 1. Vision

A writer building a secondary world today spreads it across four disconnected tools: a wiki for lore, a drawing app for the map, a spreadsheet for dates, and a document for the story. The real cost is not the note-taking — it is that **the tools cannot answer questions that span them**:

- *How large is the Ashfall Empire compared with the thing it is invading?*
- *Were Mira and Vess allies on the night the bridge burned?*
- *Who is present in the capital during the plague — and who is secretly already dead?*
- *What does the reader-facing version of this world look like once the GM's secrets are removed?*

**Thesis:** a fictional world is a **graph of entities with dates and places**. Model that graph explicitly and those questions become queries instead of memory tests. The map is not decoration bolted on at the end; it is a measurable, editable object with a real geometry engine behind it.

## 2. Target user and jobs to be done

**Primary user:** a novelist or series writer doing serious secondary-world work (fantasy, sci-fi, alternate history), working alone, on a laptop, tolerant of being offline.

| Job | Success looks like |
|-----|--------------------|
| "Build me a planet I can point at." | A 3D globe I can draw continents on, where every region knows how big it is. |
| "Remember my world for me." | Any fact is findable in ≤ 3 steps; related facts surface through backlinks and the graph. |
| "Keep my history straight." | My own calendar works; eras, events and cause→effect chains sort correctly; I can view the world at any year. |
| "Tell me what's happening in my story." | A story outline whose scenes are pinned to a world date, a place, a POV and a cast, cross-linked to the interactions they contain. |
| "Give me my world back." | One click exports a readable Story Bible (and raw JSON) that I own and can re-import. |

## 3. Scope

**In scope for v1**

1. **Worlds** — multiple per install; each defines radius, rotation speed, axial tilt, calendar and globe surface.
2. **Map Builder** — 3D globe; hex-painted regions in a continent → country → province → city/district hierarchy; points of interest; measured areas; target-area fitting; region profiles (biome, vegetation, climate, flora, fauna, resources).
3. **Lore** — templated articles with custom fields, tags, categories, backlinks and spoiler levels; any entity can carry an article.
4. **History** — custom calendar; eras; dated events (point or span, ongoing); cause/consequence links; a scrubbable timeline and "world at year X" map state.
5. **Characters** — typed attributes, affiliations, goals, flaws, secrets, arcs, portraits, and typed relationships (family, romantic, ally, rival, mentor…) with affinity and validity ranges.
6. **Interactions & Relationship Web** — scenes/encounters between characters at a date and place, with per-participant roles and **relationship deltas**; a force-directed web reflecting the folded state at the scrubbed date.
7. **Story Tracker** — Story → Arc → Chapter → Scene, each scene linked to world date, place, POV and its interactions; word counts and draft status.
8. **Export** — Story Bible and manuscript in Markdown, DOCX, EPUB; globe/map PNG; regions as GeoJSON; full project JSON backup + restore. Spoiler filtering everywhere.

**Out of scope for v1:** real-time collaboration, real-Earth GIS import, AI generation, print typesetting, native mobile (see `README.md` non-goals).

## 4. The differentiated bets

The four things mainstream competitors do badly. The architecture exists to protect them.

| Bet | Why it wins | Where it lives |
|-----|-------------|----------------|
| **The map has numbers** | Competitors give you a drawing surface; Store-y computes true geodesic areas, handles non-Earth-sized planets, and accepts an area as *input*. | ADR-0006, ADR-0007, `shared/geo/` |
| **Time is a first-class type** | Rival timelines assume a real-world calendar; Store-y stores an ordinal day number beside a fantasy date, so sorting and range queries are always correct. | ADR-0009, ADR-0010, `lib/calendar.ts` |
| **State is reconstructible "as of" a date** | The relationship web is a *fold* over dated records, not a snapshot. Scrubbing time is a core interaction, not a filter. | ADR-0008, `DATA-MODEL.md` §4 |
| **You own the world, entirely** | Full JSON export/import, no accounts, no cloud requirement, spoiler-safe documents. | ADR-0011, ADR-0012 |

## 5. Milestones

| Phase | Theme | Outcome |
|-------|-------|---------|
| **0** | Foundation | Monorepo, shared contract, DB + migrations, app shells, local quality gates, demo seed. |
| **1** | Map Builder | Drawable regions on a 3D globe with measured areas — the flagship. |
| **2** | Lore | Templated articles, tags, backlinks, spoilers, region profiles. |
| **3** | History | Custom calendars, eras, events, cause→effect, scrubbable timeline. |
| **4** | People | Characters, relationships, interactions, time-travelable relationship web. |
| **5** | Story & Export | Arc/Chapter/Scene tracking and the full export suite. |
| **6** | Polish & beyond | Search, performance, import/restore hardening, optional auth/collaboration. |

Task-level breakdown with dependencies and deliverables: [`ROADMAP.md`](./ROADMAP.md).

## 6. Constraints the design must respect

1. **No hard network dependency at runtime** — no telemetry, CDN fonts or third-party APIs.
2. **One writer, one laptop** — globe first paint < 2 s on integrated graphics; 200 regions and 2 000 events stay interactive; the DB stays well under 100 MB for a novel-scale world.
3. **Every displayed number must be reproducible** — areas, durations, word counts and date orderings come from tested functions in `backend/src/contract/` or `backend/src/lib`, never ad-hoc component maths.
4. **Destructive operations are recoverable** — soft deletes, a revision log, and a JSON export to fall back on.
5. **Spoilers are a field, not a naming convention.**

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Spherical drawing is fiddly and stalls the flagship | High | Hex painting is the default path (ADR-0006) precisely because it needs no vertex maths; freeform is explicitly optional. Prototype the globe first in Phase 1 and gate the rest behind it. |
| `three`/`react-globe.gl` bundle weight and WebGL context management | Medium | Lazy-loaded globe route, one globe instance app-wide, dispose on unmount, StrictMode-safe guards (`AGENTS.md` §11.7). |
| Custom-calendar date maths goes subtly wrong | High | The ordinal `order` field is the *only* thing ever sorted on (ADR-0010); exhaustive tests for leap rules, negative years and month-length edges. |
| 10 000+ hex cells or events slow the UI | Medium | `compactCells` for transport, virtualised timeline, viewport-culled hexes, per-tier resolution instead of one global grid. |
| Graph layout churns on every date change | Medium | Fixed-seed force layout cached per date bucket; Web Worker above 200 nodes (ADR-0008). |
| An export silently leaks secrets | High | `applySpoilerFilter()` runs server-side in the export pipeline; a test asserts a secret character never appears in a reader-profile export. |
| Schema churn during phases 1–4 | Medium | `schemaVersion` + lazy upgrades from day one (ADR-0017); JSON backup/restore shipped in Phase 0, before there is data worth losing. |

## 8. Definition of success for v1

A user can, without leaving the app and without a network connection:

1. Create a world with a custom calendar and a 4000 km-radius planet.
2. Paint three continents, split one into four countries, and read a measured area for each in km².
3. Write lore for two of them, including vegetation, and mark one paragraph as a spoiler.
4. Place six eras and twenty dated events, link three by cause, and scrub the timeline to see the world at year 512.
5. Create eight characters, connect them into a web, record five interactions, and watch the web change when they scrub from year 510 to 515.
6. Outline a story of Arcs → Chapters → Scenes, pin each scene to a date and place, and see which interactions it contains.
7. Export the Story Bible as DOCX **with spoilers removed**, export the project as JSON, then re-import that JSON into a clean install and get an identical world back.
