# ROADMAP

Phased, agent-sized work. Each task is small enough for one agent to finish in a session and is written so its completion is checkable.

**Rules of engagement:** read [`AGENTS.md`](../AGENTS.md) first. Do not start a task whose dependencies are incomplete. Do not leave scaffolding behind. Mark status here when finished (`TODO` → `DONE`, plus a one-line note). Feature IDs refer to [`FEATURES.md`](./FEATURES.md).

---

## Task template

> **T-x.y — Title** · status: `TODO` · depends: `T-a.b`
> **Goal:** one sentence.
> **Deliverables:** files/endpoints created.
> **Acceptance:** the checks that must pass.
> **Notes:** pitfalls, ADR links.

---

## Phase 0 — Foundation

Nothing user-facing ships here; this phase exists so every later phase is mechanical.

**T-0.1 — Two independent packages** · `DONE` (verified end to end: install each side → db:start → db:indexes ×2 → dev both servers → typecheck/test/build) · depends: —
**Goal:** `cd backend && npm install && cd ../frontend && npm install && cd backend && npm run db:start && npm run db:indexes && cd backend && npm run dev` and `cd frontend && npm run dev` work from a clean clone.
**Deliverables:** `backend/package.json`, `frontend/package.json`, `tsconfig.base.json` (extends in each side's `tsconfig.json`), `.gitignore` (`backend/data/`, `node_modules`, `dist`), `.env.example`, `backend/src/contract/` (API contract owned by backend), and `backend/Dockerfile` + `backend/.dockerignore` for flexible deployment.
**Acceptance:** each side typechecks independently; `cd backend && npm run dev` starts the API; `cd frontend && npm run dev` starts the web app; `cd backend && npm test` and `cd frontend && npm test` run (zero tests is fine).
**Notes:** no workspace, no shared TS package — each side has its own `node_modules`. Done-notes for followers: `backend/scripts/db-indexes.ts` holds an intentionally empty `INDEX_MANIFEST` for T-0.3 to fill; `backend/src/server.ts` is a minimal bootstrap that T-0.4 replaces with `app.ts`/`env.ts`; the frontend `App.tsx` + inline styles are placeholders T-0.5 replaces; Vite is pinned to `host: '127.0.0.1'` (its default binds IPv6 `::1` only, which breaks IPv4 clients and the API proxy); the API contract lives in `backend/src/contract/` and is owned by the backend; the frontend reads types from API responses, not from a shared TS package; companion deps (`tsx`, `@types/node`, `@types/react`, `@types/react-dom`) were added to the TECH-DECISIONS matrix; Phase 1+ libraries install with their owning tasks.

**T-0.2 — Backend-owned API contract** · `DONE` (28 tests green across the 2 workspaces, including backend import smoke tests; verified no I/O/React imports) · depends: `T-0.1`
**Goal:** one place for schemas, types, constants and pure geo/date maths — owned by the backend.
**Deliverables:** `backend/src/contract/{schemas,types,geo,dates,constants,index.ts}`; error-code constants; `spoiler.ts` exposing `applySpoilerFilter`.
**Acceptance:** imported cleanly by backend; contains no I/O and no React; frontend does not import it (gets types from API responses).
**Notes:** keep dependencies light. Done-notes for followers: `src/geo/` and `src/dates/` are deliberately not created yet — T-1.1 and T-3.1 own those files; `applySpoilerFilter` redacts any plain object with a valid `spoilerLevel` above the ceiling to `null` (root included — returns `null`), so services must filter lists with `filterBySpoilerLevel` first; `errorCodeSchema` currently knows only the generic codes — append domain codes as modules introduce them; `worldDateSchema` names the month field `month` (0-based) per DATA-MODEL §3, while ADR-0010's prose still says `monthIndex` — docs discrepancy to fix at next doc pass.

**T-0.3 — Database: connection, index manifest and seed hygiene** · `DONE` (typecheck 0 errors; db:indexes applies 53 indexes across 25 collections, idempotent; 2 transactional tests pass) · depends: `T-0.1`
**Goal:** the app connects to the local replica set and owns its indexes (no migration files).
**Deliverables:** `backend/src/db/client.ts` (driver client from `MONGO_URI` with `?replicaSet=rs0`, graceful close), `backend/src/db/collections.ts` (typed handles), `backend/src/db/indexes.ts` (the manifest from `DATA-MODEL.md`); `npm run db:start` (verifiable `mongod` bootstrap), `npm run db:indexes` (idempotent), `npm run db:shell`.
**Acceptance:** `npm run db:start` reaches a primary; `npm run db:indexes` twice in a row reports no changes the second time; a service test writes two documents transactionally and rolls back on a forced error.
**Notes:** tests connect with `?replicaSet=rs0` — a standalone `mongod` silently breaks transactions (pitfall §11.14). Never commit `backend/data/`.

**T-0.4 — Fastify app shell** · `DONE` (app.inject tests: health 200, 404 envelope, AppError→409, Zod→400, unknown→500; live boot env→db→app→listen verified; backend+shared typecheck clean) · depends: `T-0.2`, `T-0.3`
**Goal:** a testable API skeleton.
**Deliverables:** `src/app.ts` (no listen), `src/server.ts`, `src/env.ts` (Zod-parsed), error-envelope plugin, `GET /api/v1/health`.
**Acceptance:** an `app.inject()` test returns `200` for health and the standard envelope for a `404`.
**Notes:** tests must never bind a port. Done-notes for followers: services throw `AppError` from `backend/src/lib/errors.ts` (pure; carries code/status/details; default status per code) — the Fastify glue lives in `backend/src/plugins/errors.ts` (AppError→its status, ZodError→400 VALIDATION_ERROR with issues list, other client errors keep status, 500s hide internals); `connectDb(uri?, dbName?)` now accepts explicit values — `server.ts` passes the parsed env, env-var defaults remain for standalone scripts; `env.ts` is the single place env is validated (zod added to backend deps); health is liveness-only (no DB ping). Found while working: T-0.3's db files import with `.js` extensions while the rest of the repo is extensionless — both resolve under `moduleResolution: bundler`, but CONVENTIONS should pick one (noted, not refactored — outside this task's scope).

**T-0.5 — Frontend shell** · `DONE` (typecheck 0 errors; 34 tests green across all workspaces; dev server renders layout shell and health check) · depends: `T-0.1`
**Goal:** an app that renders, routes, and talks to the API — already in the component shape every later feature copies.
**Deliverables:** Vite config with an `/api` proxy, Tailwind 4 via `@tailwindcss/vite`, `main.tsx`, `App.tsx`, `routes.tsx`, `lib/api.ts` typed fetch client, TanStack Query provider, Redux Toolkit store (`view`, `timeline`, `map` slices — reducers + typed `dispatch` hooks). The shell itself is built the component-first way: `App` composes `AppShell` (header/sidebar/outlet) from `components/layout/`, and no page component exceeds ~100 lines of composition.
**Acceptance:** the dev server renders the layout shell and successfully calls `/api/v1/health`.
**Notes:** dark theme by default; fix the type scale here so later phases do not improvise. Set the component-first precedent here (`CONVENTIONS.md` §5) so Phase 1+ features copy the shape, not a monolithic page.

**T-0.6 — Design-system primitives** · `DONE` (typecheck 0 errors; all 14 primitives compile; no `any`; shadcn/ui convention) · depends: `T-0.5`
**Goal:** the ~10 components every feature needs, owned in-repo (shadcn/ui convention).
**Deliverables:** `components/ui/`: Button, Input, Textarea, Select, Dialog, Popover, Tooltip, Tabs, Badge, Card, Table, Toast, Spinner, EmptyState. Plus `lib/utils.ts` (cn helper) and design tokens in `index.css` (`@theme` block with `oklch` colour stops for primary/secondary/destructive/background/muted/popover/card/input/ring).
**Acceptance:** a demo route renders each in its states; keyboard focus rings visible; no `any`.
**Notes:** Radix UI 1.1.23 primitives + CVA 0.7.1 + tailwind-merge 3.7.0 + clsx 2.1.1; icons from `lucide-react`. Radix versions corrected in TECH-DECISIONS.md (1.6.7 was wrong — actual resolved: Dialog 1.1.23, Popover 1.1.23, Tooltip 1.2.16, Tabs 1.1.21, Select 2.3.7, Accordion 1.2.20).

**T-0.7 — Quality gates** · `DONE` (all gates exit 0 across both packages; ESLint flat config + typescript-eslint + strict rules + no-explicit-any, Prettier 3.9.8, vitest.config per package with isolated environments and proper exclusions; typescript 5.9.3 fallback activated per ADR-0001) · depends: `T-0.1`
**Goal:** one command each for the things we will run constantly.
**Deliverables:** ESLint flat config (`typescript-eslint`), Prettier, `npm run typecheck|lint|format`, vitest config per workspace, one passing test per workspace.
**Acceptance:** every command exits `0` on the clean scaffold.

**T-0.8 — JSON backup & restore** · `DONE` (export/import endpoints live; round-trip deep equality on wiped DB passes; ID remapping and foreign-key rewriting validated; 38 tests green; schemas split modularly under 300 lines) · depends: `T-0.3`, `T-0.4`
**Goal:** data ownership from day one, before there is data to lose.
**Deliverables:** `GET /api/v1/worlds/:id/export.json`, `POST /api/v1/worlds/import`, Zod schemas for the whole file, round-trip tests.
**Acceptance:** export a seeded world, wipe the DB, import, and assert deep equality of every entity.
**Notes:** carry a `schemaVersion` in the file — this is also the migration path if the schema changes shape.

**T-0.9 — Demo seed & fixtures** · `DONE` (idempotent `npm run seed` creating Aetheria world exercising all 15 collections; 1 calendar, 3 continents, 4 countries, 4 places, 2 layers, 6 characters, 8 relationships, 10 interactions, 5 eras, 12 events, 1 story with 3 chapters, plus tags, categories, templates, articles, entity links, assets, and export profiles; round-trip export & re-import verified with deep equality; all tests and gates green) · depends: `T-0.8`
**Goal:** a world exercising every table, used by tests and manual QA.
**Deliverables:** `npm run seed` creating one world, a custom calendar, 3 continents, 4 countries, 6 characters, 8 relationships, 10 interactions, 5 eras, 12 events, and a story with 3 chapters.
**Acceptance:** the seeded world exports and re-imports cleanly; the seed is idempotent or safely resettable.
**Notes:** `npm run seed` (via `backend/scripts/seed.ts` and `seedDemoWorld`) supports `reset: true` (default in CLI) for idempotent re-runs; seed data is strictly split across modular data builders under 300 lines each (`constants.ts`, `world-calendar.ts`, `regions-places.ts`, `history.ts`, `people-relationships.ts`, `interactions.ts`, `story-lore.ts`); round-trip export/re-import verified with deep equality in `seed.test.ts`.

---

## Phase 1 — Map Builder (the flagship)

**T-1.1 — Geo primitives in `shared/geo`** · `DONE` (34 tests passing across 3 test files; pinned ADR-0007 figures: 500 km circle = 784 905 km², res-5 avg cell = 252.9039 km², R=12742 km => ~x4.0; round-trip [lng,lat]<->[lat,lng] verified; exact cellArea scaling and geometry utilities) · depends: `T-0.2`
**Goal:** all geodesy in one tested place before any UI exists.
**Deliverables:** `geo/h3.ts` (lat/lng ↔ GeoJSON conversion, paint helpers), `geo/area.ts` (`regionAreaKm2`, radius scaling, unit conversion), `geo/geometry.ts` (bbox, centroid, simplify, self-intersection check).
**Acceptance:** tests pin the verified figures from ADR-0007 (500 km circle = 784 905 km²; res-5 average cell = 252.9039 km²; R = 12 742 km ⇒ ×4.0) and assert the `[lng,lat]`/`[lat,lng]` conversion round-trips.
**Notes:** **read `AGENTS.md` §11.2–§11.5 before writing this file.** `cellArea` takes a cell, not a resolution — passing a resolution returns a constant and silently corrupts every area in the app.

**T-1.2 — World CRUD + settings UI** · `DONE` (7 backend tests green covering transactional world+calendar creation, cursor pagination, 404/409 stale writes, R-scaled area propagation; frontend settings form, create dialog, world selector, radius change confirmation dialog with unit tests passing; typecheck & lint clean) · depends: `T-0.4`, `T-0.5`, `T-1.1`
**Goal:** create and configure a world (F-WORLD-1).
**Deliverables:** `modules/worlds/*`, `features/worlds/*`, world settings page (name, radius, tilt, units, surface seed), default calendar creation.
**Acceptance:** creating a world seeds a calendar; a radius change recomputes region areas after a confirmation dialog; covered by a service test.

**T-1.3 — Region CRUD + hierarchy** · `DONE` (9 backend tests green covering transactional region creation, revision tracking, REGION_PARENT_CYCLE self & deep detection, REGION_OUTSIDE_PARENT cell containment verification, reparent & cascade delete strategies, soft delete & restore, depth-5 nesting; frontend api hooks and canvas integration; all quality gates green) · depends: `T-1.2`
**Goal:** regions exist, nest and validate (F-MAP-3).
**Deliverables:** `modules/regions/{routes,service,repo,hierarchy,builder}`, cycle detection, containment validation, soft delete + restore, paginated list endpoint.
**Acceptance:** cycle and out-of-parent cases rejected with stable error codes; depth-5 nesting works; revisions recorded.

**T-1.4 — Globe view** · `DONE` (lazy-loaded /map route with RegionsPage code-split; GlobeCanvas facade isolating react-globe.gl; WebGL context disposal verified across 10 mount/unmount cycles under StrictMode with zero leaks; procedural 3D equirectangular texture generation <20ms; camera persistence and onGlobeReady gating verified; region selection altitude lifting verified; 33 frontend tests green across 9 test files; typecheck and lint clean) · depends: `T-0.6`, `T-1.2`
**Goal:** a world you can look at (F-MAP-1).
**Deliverables:** lazy-loaded globe route, imperative facade over the ref, procedural canvas texture, camera persistence, `onGlobeReady` gating, disposal on unmount — structured as `features/regions/components/`: `GlobeCanvas.tsx` (lifecycle + ref facade), `RegionPolygons.tsx` / `HexOverlay.tsx` (layer data), with the imperative logic in `hooks/use-globe-camera.ts`, and a slim `RegionsPage.tsx` composing them.
**Acceptance:** no WebGL context leak across 10 mount/unmount cycles under StrictMode; first paint < 2 s; selecting a region lifts it via `polygonAltitude`.
**Notes:** pitfall §11.7 — the ref is null before ready. The globe stays behind the `GlobeCanvas` facade — no other component imports `react-globe.gl` directly.

**T-1.5 — Hex painting interaction** · `TODO` · depends: `T-1.4`, `T-1.1`
**Goal:** paint cells on the globe (F-MAP-2).
**Deliverables:** ray–sphere picking, a `hexPolygonsData` working layer, drag-paint/erase, resolution stepper, draft state in `useMapStore`, live area/cell counter, commit via `POST /regions/bulk/cells` (single transaction: region upsert + revision + world area totals, all in one session). Component shape: `hooks/use-region-painting.ts` owns the picking/drag logic so `PaintPalette.tsx` and the counter stay presentational and the logic is testable without the globe.
**Acceptance:** the F-MAP-2 checks — 50 painted cells ⇒ `cellCount` 50 and area = Σ exact `cellArea`; a 200-cell drag stays responsive; cancel leaves no server state.
**Notes:** cap embedded cells at 300 000 per region per ADR-0016; above the cap write the companion `regionCells` document in the same session.
**Notes:** the riskiest task in the project. Spike the picking first; keep hand-rolled spherical maths out of the diff (pitfall §11.8).

**T-1.6 — Measured area display + target fitting** · `TODO` · depends: `T-1.5`
**Goal:** the product's headline number, and "make it this big" (F-MAP-4).
**Deliverables:** area/delta readout in the paint UI, unit switcher, target-area input with resolution suggestion and grow/shrink loop.
**Acceptance:** the four F-MAP-4 criteria, including convergence within ±2 % for all three target sizes.

**T-1.7 — Region profile editor (vegetation & lore fields)** · `TODO` · depends: `T-1.3`, `T-0.6`
**Goal:** a region owns its worldbuilding detail (F-MAP-7).
**Deliverables:** region profile service functions inside `modules/regions/*` (the profile is embedded — no separate module), a tabbed profile editor, biome/climate selects from `shared/constants`, Markdown fields for vegetation.
**Acceptance:** profile round-trips completely; region list can show a biome summary without the full payload; `spoilerLevel` honoured.

**T-1.8 — Places (points of interest)** · `TODO` · depends: `T-1.4`
**Goal:** put named dots on the map (F-MAP-6).
**Deliverables:** `modules/places/*`, click-to-place on the globe, containment-based region assignment, `pointsData`/`labelsData` rendering, place list panel.
**Acceptance:** F-MAP-6 criteria, including the 0.5° coordinate accuracy check.

**T-1.9 — Map layers + texture upload** · `TODO` · depends: `T-1.4`
**Goal:** persistent, composable map presentation (F-MAP-8).
**Deliverables:** `modules/map-layers/*`, layer toggle/opacity/z-order UI, multipart upload for equirectangular textures, `assets` storage with checksums.
**Acceptance:** layer state and uploaded texture both survive a reload.

**T-1.10 — Freeform polygon mode** · `TODO` · depends: `T-1.5` · *optional, advanced*
**Goal:** organic coastlines for users who want them (F-MAP-5).
**Deliverables:** vertex capture and editing, geodesic edge preview, self-intersection rejection, rasterisation to cells, `sourceGeometry` retention.
**Acceptance:** the three F-MAP-5 criteria.
**Notes:** deliberately last in the phase — the hex path already delivers a complete map builder without it.

---

## Phase 2 — Lore

**T-2.1 — Articles + templates** · `TODO` · depends: `T-1.3`
**Goal:** the general lore system (F-LORE-1).
**Deliverables:** `modules/articles/*`, `modules/article-templates/*`, built-in template seeds, Markdown editor with preview, custom-field renderer for all field types.
**Acceptance:** the four F-LORE-1 criteria.
**Notes:** custom fields are JSON validated against the template — never add a column per field.

**T-2.2 — Categories, tags, entity links** · `TODO` · depends: `T-2.1`
**Goal:** organisation and cross-referencing (F-LORE-2).
**Deliverables:** `modules/tags/*`, `modules/categories/*`, `modules/entity-links/*`, `shared/constants/relation-rules.ts`, backlinks panel component.
**Acceptance:** F-LORE-2 criteria; link cleanup on entity delete has a test.

**T-2.3 — `[[wiki]]` links and stub articles** · `TODO` · depends: `T-2.1`
**Deliverables:** Markdown link resolution, `is_stub` creation, "unwritten articles" list view.
**Acceptance:** a stub resolves into a real article without breaking any existing link.

**T-2.4 — Full-text search (`$text`)** · `TODO` · depends: `T-2.1`
**Deliverables:** `$text` index + write-time field extraction, `GET /api/v1/search`, command-palette UI (`Ctrl/Cmd-K`), spoiler filtering.
**Acceptance:** F-LORE-3 criteria. Note the hard limits: one `$text` index per collection, no substring matching — do not promise prefix search.

---

## Phase 3 — History

**T-3.1 — Calendar engine in `shared/dates`** · `TODO` · depends: `T-0.2`
**Goal:** the date maths everything else depends on (ADR-0010).
**Deliverables:** `toOrder`, `fromOrder`, `formatWorldDate`, `durationBetween`, `validateWorldDate`, leap-rule evaluation, Gregorian default.
**Acceptance:** exhaustive tests over a 400-year span with the Gregorian leap rule; negative years; 400-day/10-month calendars; round-trip `fromOrder(toOrder(d)) === d` for every date in a synthetic calendar.
**Notes:** **zero-based months, one-based days.** Write those tests first.

**T-3.2 — Calendar editor UI** · `TODO` · depends: `T-3.1`, `T-0.6`
**Goal:** let writers invent a calendar (F-HIST-1).
**Deliverables:** month list editor with drag-reorder, leap-rule form, live date preview, the confirmation + full-recompute path.
**Acceptance:** F-HIST-1 criteria, including the transactional recompute test.

**T-3.3 — Eras CRUD** · `TODO` · depends: `T-3.1`
**Deliverables:** `modules/eras/*`, era banding component, era-based event filtering.
**Acceptance:** F-HIST-2 criteria.

**T-3.4 — Historical events + causality** · `TODO` · depends: `T-3.3`, `T-2.2`
**Deliverables:** `modules/historical-events/*`, cause/consequence links via `EntityLink`, DAG cycle rejection, importance, region/place attachment.
**Acceptance:** F-HIST-3 criteria.

**T-3.5 — Timeline component** · `TODO` · depends: `T-3.4`
**Goal:** the scrubbable axis that drives the app (ADR-0009, F-HIST-4).
**Deliverables:** `features/timeline/*`: virtualised lanes, zoom levels, event cards, scrubber publishing `asOf`, URL sync.
**Acceptance:** F-HIST-4 criteria, including the 10 000-event interaction check.

**T-3.6 — "World at date X" wiring** · `TODO` · depends: `T-3.5`
**Deliverables:** `asOf` filters across event, character, place and region lists; a visible "viewing year 512" indicator with a one-click return to now.
**Acceptance:** every time-aware list respects `asOf`; no view silently ignores it.

---

## Phase 4 — People

**T-4.1 — Characters CRUD** · `TODO` · depends: `T-2.1`, `T-3.1`
**Goal:** the character builder (F-CHAR-1).
**Deliverables:** `modules/characters/*`, list with filters (role, species, status, tags), sheet UI with tabs (Identity / Personality / History / Secrets / Links / Custom), portrait upload.
**Acceptance:** F-CHAR-1 criteria, including age-at-`asOf` from WorldDates and the alive/dead flip.
**Notes:** affiliations are `entity_links`, not columns — do not add `faction_id`.

**T-4.2 — Relationships CRUD** · `TODO` · depends: `T-4.1`
**Deliverables:** `modules/relationships/*`, symmetric-edge dedupe, kinship subtypes, validity ranges, relationship panel on both character sheets.
**Acceptance:** F-CHAR-2 criteria.

**T-4.3 — Interaction maker** · `TODO` · depends: `T-4.1`, `T-3.4`
**Deliverables:** `modules/interactions/*`, participant editor (role/POV/goal), region & place attachment, calendar-aware date picker, filters.
**Acceptance:** F-INT-1 criteria.

**T-4.4 — Relationship deltas + the fold** · `TODO` · depends: `T-4.2`, `T-4.3`
**Goal:** make the web time-travelable (F-INT-2).
**Deliverables:** deltas editor nested in the interaction form (deltas are embedded in the interaction document — no separate module or collection); `shared/relationships/foldRelationshipState.ts`; UI to add deltas while writing an interaction.
**Acceptance:** the fold's five unit-test cases pass; the betrayal scenario works end to end.

**T-4.5 — Relationship web** · `TODO` · depends: `T-4.4`, `T-0.6`
**Goal:** the flagship visualisation (F-INT-3, ADR-0008).
**Deliverables:** `features/relationships/` — custom React Flow nodes/edges, fixed-seed d3-force layout, worker offload, filters, inspector, scrubber binding.
**Acceptance:** F-INT-3 criteria, including layout determinism and smooth 200-node rendering.

**T-4.6 — Family tree view** · `TODO` · depends: `T-4.5` · *optional*
**Deliverables:** a layered (`elkjs`) mode over the same node data, restricted to `family` edges.
**Acceptance:** three generations render without crossing direct lineage.

---

## Phase 5 — Story & Export

**T-5.1 — Stories, arcs, chapters** · `TODO` · depends: `T-4.1`
**Deliverables:** `modules/stories/*`, `modules/arcs/*`, `modules/chapters/*`, outline board, Markdown editor with word counting.
**Acceptance:** F-STORY-1 criteria for narrative vs chronological order and word counts.

**T-5.2 — Scenes + story links** · `TODO` · depends: `T-5.1`, `T-4.3`
**Deliverables:** `modules/scenes/*`, embedded `cast[]` + `interactionIds[]` with bidirectional attach/detach, scene cards, drag-reorder.
**Acceptance:** interaction↔scene linking is bidirectional; a scene's cast is derived and editable.

**T-5.3 — "What's happening" dashboard + contradiction checks** · `TODO` · depends: `T-5.2`, `T-3.6`
**Deliverables:** dashboard view, `shared/consistency/` pure check functions, warning UI.
**Acceptance:** F-STORY-2 criteria.

**T-5.4 — Export core + Markdown/JSON renderers** · `TODO` · depends: `T-0.8`
**Goal:** one shared IR, first two renderers.
**Deliverables:** `modules/export/{service,ir,renderers/markdown,renderers/json}`, export-profile CRUD, spoiler filtering wired in.
**Acceptance:** F-EXP-1, F-EXP-3 (Markdown + JSON) and F-EXP-4 criteria.

**T-5.5 — DOCX renderer** · `TODO` · depends: `T-5.4`
**Deliverables:** `renderers/docx.ts` with TOC, headings, images, map plates.
**Acceptance:** opens in LibreOffice/Word with a working TOC; spoiler test passes.

**T-5.6 — EPUB renderer** · `TODO` · depends: `T-5.4`
**Deliverables:** `renderers/epub.ts` (`epub-gen-memory`), cover generation, spine ordering.
**Acceptance:** the EPUB validates and reads correctly in a standard reader app.

**T-5.7 — Map / GeoJSON export** · `TODO` · depends: `T-1.4`, `T-5.4`
**Deliverables:** globe snapshot to PNG (camera, resolution, legend), region/place GeoJSON export.
**Acceptance:** GeoJSON opens in an external GIS tool at the correct coordinates.

**T-5.8 — Export UI** · `TODO` · depends: `T-5.4`
**Deliverables:** export wizard (profile → scope → options → run), job progress, download, recent exports.
**Acceptance:** a user can produce a reader-facing Story Bible using only this UI, without documentation.

**T-5.9 — Playwright E2E suite** · `TODO` · depends: `T-5.8`
**Deliverables:** E2E covering the `PLAN.md` §8 success list.
**Acceptance:** green against a freshly seeded database.

---

## Phase 6 — Polish & beyond

| Task | Goal |
|------|------|
| **T-6.1 Performance pass** | Meet every budget in `ARCHITECTURE.md` §8 on a 200-region / 2 000-event world. |
| **T-6.2 Error and empty states** | Every panel has designed loading, empty and error states; no blank divs. |
| **T-6.3 Accessibility pass** | Keyboard-only traversal of every core flow; focus management; non-canvas equivalents for map actions. |
| **T-6.4 Time-aware borders** | Wire `regions.valid_from_order` / `valid_to_order` to the scrubber so the map redraws political boundaries at any year. |
| **T-6.5 World generator (stretch)** | Optional "generate a starting planet" (Voronoi/plate seeds) — never the default path (ADR-0006). |
| **T-6.6 Auth & multi-user (stretch)** | Enable the auth plugin, add `users`/`sessions`, per-actor revisions — only if the product direction changes (open question Q1). |
| **T-6.7 Collaboration (stretch)** | Yjs/WebSocket real-time editing. Explicitly out of scope for v1. |
| **T-6.8 Real-Earth import (stretch)** | Start from real coastlines/borders for alternate-history writers (open question Q5). |

---

## Phase summary

| Phase | Tasks | Gate to proceed |
|-------|-------|-----------------|
| 0 — Foundation | 9 | `npm install && npm run db:start && npm run dev && npm test` all green; JSON round-trip passes. |
| 1 — Map Builder | 10 | A painted continent reports a correct, verified area. **Do not proceed otherwise** — this is the flagship. |
| 2 — Lore | 4 | Articles, tags and backlinks usable without the map. |
| 3 — History | 6 | Calendar maths exhaustively tested; scrubbing visibly changes other views. |
| 4 — People | 6 | The betrayal scenario visibly changes the web across a date range. |
| 5 — Story & Export | 9 | The `PLAN.md` §8 list is fully demonstrated end to end. |
| 6 — Polish | 8 | Budgets met; stretch items only on explicit request. |

---

## Critical path

```
T-0.1 ─┬─ T-0.2 ─┬─ T-1.1 ─┬─ T-1.2 ─ T-1.3 ─ T-1.4 ─ T-1.5 ─ T-1.6      (Phase 1 gate)
       │         │         └─ T-0.4 ─────────────────────────────────┐
       ├─ T-0.3 ─┴─ T-0.8 ─────────────────────────────────────────┐ │
       └─ T-0.5 ─ T-0.6 ─────────────────────────────────────┐     │ │
                                                             │     │ │
Phase 2: T-2.1 ─ T-2.2 ─ T-2.3 ─ T-2.4                       │     │ │
Phase 3: T-3.1 ─ T-3.2 ─ T-3.3 ─ T-3.4 ─ T-3.5 ─ T-3.6 ◄─────┘     │ │
Phase 4: T-4.1 ─ T-4.2 ─ T-4.3 ─ T-4.4 ─ T-4.5                       │ │
Phase 5: T-5.1 ─ T-5.2 ─ T-5.3, and T-5.4 ◄───────────────────────────┘ │
         T-5.5 ─ T-5.6 ─ T-5.7 ─ T-5.8 ─ T-5.9 ◄─────────────────────────┘
```

**Three tasks are the real risk. Do them early and deliberately:**
1. **T-1.1** (`shared/geo`) — every area in the app depends on it, and the H3 API has traps (`AGENTS.md` §11).
2. **T-1.5** (hex painting) — the flagship interaction; if it works, the product's differentiator is proven.
3. **T-3.1** (calendar engine) — subtle, pervasive, and impossible to retrofit later.

## Working agreement

- Claim a task by marking it `IN PROGRESS` with your agent id here before starting.
- Mark `DONE` with a one-line note about anything a follow-up needs to know.
- If a task turns out to be two tasks, split it here rather than in your head.
- If acceptance cannot be met as written, **stop and report** rather than quietly weakening the criteria.
