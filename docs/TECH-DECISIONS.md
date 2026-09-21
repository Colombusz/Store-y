# TECHNICAL DECISIONS (ADR log)

Every non-obvious technical choice in Store-y is recorded here as an Architecture Decision Record. **Do not add a dependency or change an architectural boundary without adding an ADR in the same change** (see `AGENTS.md` §7.8).

Status values: `Accepted` · `Provisional` (may change once built) · `Superseded`.

Versions below were resolved from the live npm registry on the project's dev machine and are the versions to pin in Phase 0 task **T-0.1**.

---

## Verified dependency matrix

| Area | Package | Version | Licence | Notes |
|------|---------|---------|---------|-------|
| Runtime | Node.js | 24.18.0 | MIT | Already installed. |
| Language | typescript | 7.0.2 | Apache-2.0 | `latest`. Fallback `5.9.3` if a plugin lags. See ADR-0001. |
| API | fastify | 5.12.5 | MIT | |
| API | @fastify/cors | 11.3.0 | MIT | Dev only; prod is same-origin. |
| API | @fastify/multipart | 10.1.1 | MIT | Image/texture uploads. |
| API | @fastify/static | 10.1.4 | MIT | Serves uploads + built SPA. |
| Validation | zod | 4.6.5 | MIT | Shared contract. |
| DB | **mongod (server)** | **8.3.4** | SSPL-1.0 | **Already installed on this machine** (`mongodb-bin` 8.3.4-1 from the AUR). Verified running as a single-node replica set. Not an npm dependency — a local service started by `npm run db:start`. |
| DB | **mongodb (Node driver)** | **7.6.0** | Apache-2.0 | Official driver. No ODM (ADR-0018). |
| DB | mongosh | 2.9.2 | SSPL-1.0 | Already installed. Used for `rs.initiate()` and debugging. |
| UI | react / react-dom | 19.3.0 | MIT | |
| UI | vite | 8.3.0 | MIT | |
| UI | @vitejs/plugin-react | 6.1.1 | MIT | Requires Vite ^8. |
| UI | tailwindcss + @tailwindcss/vite | 4.3.3 | MIT | |
| UI | radix-ui | 1.6.7 | MIT | Unified primitives package. |
| UI | class-variance-authority / tailwind-merge / clsx | 0.7.1 / 3.7.0 / 2.1.1 | MIT | Styling utilities. |
| UI | lucide-react | 1.47.0 | ISC | Icons. |
| UI state | @tanstack/react-query | 5.103.1 | MIT | Server state. |
| UI state | zustand | 5.0.15 | MIT | Ephemeral UI state. |
| UI state | react-router-dom | 7.5.3 | MIT | SPA routing; `createBrowserRouter` + `RouterProvider`. Peer `react >=18`. |
| Globe | react-globe.gl | 2.38.0 | MIT | Wraps globe.gl 2.46.2 + three-globe 2.45.2; peer `react: '*'`. |
| Globe | three | 0.186.0 | MIT | Satisfies globe.gl's `>=0.179 <1`. |
| Geo | h3-js | 4.5.0 | Apache-2.0 | H3 core v4.5 parity. |
| Geo | @turf/area | 7.4.0 | MIT | Prefer granular turf packages over the full `@turf/turf` meta-package. |
| Geo | @turf/helpers, @turf/circle, @turf/boolean-point-in-polygon | 7.4.0 | MIT | Pull in as needed. |
| Graph | @xyflow/react | 12.11.6 | MIT | Peer `react >=17`. |
| Graph | d3-force | 3.0.0 | ISC | Layout; `@types/d3-force` 3.0.10. |
| Export | docx | 9.7.1 | MIT | DOCX generation. |
| Export | epub-gen-memory | 1.1.2 | MIT | EPUB in memory (no disk temp files). |
| Export | pdf-lib | 1.17.1 | MIT | PDF. |
| Export | jszip | 3.10.2 | MIT/GPL-3.0 dual | Multi-file export bundles. |
| Export | marked | 18.0.13 | MIT | Markdown → HTML for EPUB/PDF. |
| Test | vitest | 5.0.1 | MIT | Peer `vite ^6.4 \|\| ^7 \|\| ^8` — Vite 8 OK. |
| Test | @vitest/coverage-v8 | 5.0.1 | MIT | |
| Test | @testing-library/react | 16.3.3 | MIT | |
| Test | jsdom | 30.1.0 | MIT | |
| Test | playwright | 1.63.0 | Apache-2.0 | E2E, Phase 5+. |
| Tooling | concurrently | 10.0.5 | MIT | `npm run dev`. |
| Tooling | eslint | 10.11.0 | MIT | Flat config. |
| Tooling | typescript-eslint | 8.70.0 | MIT | |
| Tooling | prettier | 3.9.8 | MIT | |
| Tooling | tsx | 4.23.15 | MIT | Dev-only TS runner: `dev`, `db:indexes`. Pinned at T-0.1 — absent from the original resolution. |
| Types | @types/node | 24.13.6 | MIT | Matches the machine's Node 24 runtime major. Pinned at T-0.1. |
| Types | @types/react, @types/react-dom | 19.3.0 | MIT | Match react 19.3.0. Pinned at T-0.1. |

\* *Pinned at T-0.1*: resolved from the registry when the scaffold landed; all other rows were resolved earlier. Phase 1+ libraries (three, h3-js, turf packages, react-globe.gl, Radix, Tailwind, xyflow, export libraries, …) are installed by the task that first needs them, at the versions pinned above. `playwright` additionally needs its browser download, so it waits for T-5.9.

**Not used, deliberately:** `@turf/turf` (meta-package pulls ~100 modules; import granular packages), `vis-timeline` (drags in moment + hammerjs + xss; see ADR-0009), `leaflet`/`maplibre-gl` (not needed while the globe is the primary map — see ADR-0005), `cytoscape` (only worth it above ~500 visible nodes; see ADR-0008), `mongoose` (duplicates Zod as a schema source of truth; see ADR-0018), `drizzle-orm`/`better-sqlite3` (relational — superseded by ADR-0014).

---

## ADR-0001 — TypeScript monorepo on npm workspaces

**Status:** Accepted (TypeScript version Provisional)

**Context.** Three deployables share one contract: the API, the SPA, and the geospatial/validation code. `pnpm` and `yarn` are not installed on the dev machine; `npm@12` is.

**Decision.** A three-package npm workspace — `backend`, `frontend`, `packages/shared` — with TypeScript `strict` everywhere, one root lockfile, and root orchestration scripts. Pin `typescript@7.0.2` (current `latest`).

**Consequences.** `packages/shared` is the only cross-import; neither app may import the other. If a plugin (ESLint, Vite) misbehaves under TS 7, drop to `typescript@5.9.3` — a one-line change, which is why the fallback is recorded here.

**Rejected.** *pnpm/yarn* — not installed, marginal benefit at this size. *Nx/Turborepo* — extra config surface and a daemon for three packages. *Bun* — not installed. *A single flat package* — would let UI code import server code and vice versa, exactly the boundary we need.

---

## ADR-0002 — ~~SQLite + Drizzle ORM for persistence~~ (SUPERSEDED)

**Status:** **Superseded by [ADR-0014](#adr-0014--mongodb-as-the-store-supersedes-adr-0002)** — the project switched from a relational store to a document store at the user's request. This record is kept because the reasoning below about local-first operation and data ownership still holds and is honoured by ADR-0014.


**Context.** The product is a writer's tool: one author, one world (occasionally several), tens of thousands of rows, and a hard requirement that the user owns their data and needs no infrastructure. **Docker is not installed on the dev machine**, so a containerised database is not an option.

**Decision.** SQLite in WAL mode via `better-sqlite3` 13.0.3, through Drizzle ORM 0.45.2 with `drizzle-kit` migrations. The database file lives at `backend/data/storey.db`; uploaded assets in `backend/data/uploads/`. That pair **is** the project state and is trivially backed up or moved.

**Evidence.** `npm install better-sqlite3@13` completed in **1 second** with a prebuilt binary for Node 24 (ABI 137) — no `node-gyp`, no compiler, no build tools needed. Drizzle's peer range accepts `better-sqlite3 >=7`.

**Consequences.** Drizzle's SQLite driver is **synchronous**: DB work blocks the event loop. Fine at this scale, but long queries must not creep in, and multi-table writes need explicit transactions. If concurrent writers are ever needed, Drizzle also supports Postgres/libSQL, so the ORM layer survives the move.

**Rejected.** *PostgreSQL* — needs a service and Docker is unavailable; violates "runs on a laptop". *`node:sqlite`* — verified working on this Node (`DatabaseSync` opened a DB, inserted and read a row with **zero dependencies**), and tempting, but its Drizzle integration is less mature; revisit as a dependency-removal task once the schema stabilises. *Prisma* — ships its own engine binary and schema language, duplicating Zod. *Raw SQL* — loses end-to-end type safety on the app's largest tables.

---

## ADR-0003 — Zod schemas in `packages/shared` as the single API contract

**Status:** Accepted

**Context.** GeoJSON geometry, `WorldDate`, custom-field definitions and spoiler levels all cross the wire. Drift in these shapes produces silent data corruption rather than compile errors.

**Decision.** Every request/response shape is a Zod 4 schema in `packages/shared/src/schemas`. The backend parses inbound payloads with them; the frontend derives types via `z.infer`. Cross-field rules (e.g. a region cannot be its own ancestor) live with the schema.

**Consequences.** Changing an API shape is one file, visible to both sides immediately. The same schemas validate template-defined custom fields and imported backup files during restore.

**Rejected.** *tRPC* — attractive, but couples the two workspaces directly, and we want the API consumable by other clients later. *Hand-written interfaces + AJV* — two sources of truth.

---

## ADR-0004 — Fastify as the HTTP layer

**Status:** Accepted

**Context.** A local API serving JSON, uploads and downloads, with heavy Zod validation at the boundary.

**Decision.** Fastify 5, structured as plugins, one plugin per module. `backend/src/app.ts` builds the instance **without listening** so tests call `app.inject()`.

**Consequences.** No server or port is needed in tests, so integration tests are fast. `@fastify/multipart` handles texture/portrait uploads; `@fastify/static` serves uploads in dev and the built SPA in production.

**Rejected.** *Express* — no built-in validation or plugin encapsulation, slower. *NestJS* — decorators, a DI container and a large conceptual footprint for a single-author app. *Hono* — excellent, but adds nothing on Node here and Fastify's plugin model maps cleanly onto our module convention.

---

## ADR-0005 — `react-globe.gl` for the 3D globe

**Status:** Accepted

**Context.** The headline feature is a 3D globe for a **fictional** world: custom continents, no satellite imagery, no real-Earth tiles. Users must draw regions on it, and the app must convert pointer positions into geographic coordinates.

**Decision.** Use `react-globe.gl` 2.38.0 (globe.gl 2.46.2 / three-globe 2.45.2 over three 0.186.0). Its ref exposes exactly the imperative surface the map editor needs (all names verified against the README):

| Capability | Verified API |
|-----------|--------------|
| Region polygons | `polygonsData`, `polygonGeoJsonGeometry`, `polygonCapColor`, `polygonSideColor`, `polygonStrokeColor`, `polygonAltitude`, `polygonCapCurvatureResolution`, `polygonLabel` |
| Hex tiles | `hexPolygonsData`, `hexPolygonResolution`, `hexPolygonMargin`, `hexPolygonUseDots`, `hexPolygonColor`, `hexPolygonAltitude`, `hexPolygonLabel` |
| Point/line features | `pointsData`, `labelsData`, `arcsData`, `ringsData` |
| Events | `onPolygonClick/Hover/RightClick`, `onHexPolygonClick/Hover/RightClick`, `onGlobeClick`, `onGlobeReady`, `onZoom` |
| Surface | `globeImageUrl`, `bumpImageUrl`, `backgroundImageUrl`, `globeMaterial`, `showGlobe`, `showAtmosphere`, `atmosphere` |
| Ref methods | `pointOfView`, `getCoords`, `toGeoCoords`, `getScreenCoords`, `getGlobeRadius` |

`toGeoCoords({x,y,z})` is what makes spherical drawing tractable, and the peer range is `react: '*'`, so React 19 is fine.

**Consequences.** The globe texture is **ours to produce** (procedural noise plus an upload override) — there is no tile server. Bundle weight is real (Three.js), so the globe route is lazy-loaded and code-split.

**Rejected.** *CesiumJS* — Earth-first, needs terrain/ion assets or tokens, far more configuration. *MapLibre GL globe projection* — genuinely supported (`map.setProjection({ type: 'globe' })` on `style.load`, verified in the v6 docs) but it is a projection of a real-Earth tile pyramid, so a hand-drawn fantasy planet is the wrong input; pairing it with a drawing library also carries version risk (the `terra-draw-maplibre-gl-adapter` peer range is `maplibre-gl >= 4` while its README documents support for v4/v5 only). *deck.gl GlobeView* — superb for data viz, awkward for interactive authoring. *Raw three.js* — maximum control, but we would rebuild polygon extrusion, labels, arcs and camera tweening that globe.gl already provides.

---

## ADR-0006 — Region authoring by H3 hex painting, with freeform polygons as an advanced mode

**Status:** Accepted

**Context.** "The user will first define regions, specify the size of each region/country/city." Drawing organic polygons directly on a sphere is the hardest interaction in the app: vertex insertion, geodesic edge interpolation, self-intersection rejection, neighbour-aware borders, and live area feedback. Area accuracy also matters more here than in a drawing app — it is a stated feature.

**Decision.** Make **paint-by-hex** the default authoring mode, powered by `h3-js` 4.5.0:

- The globe shows a hex grid at a **working resolution** chosen per tier: continent ≈ res 2–3, country ≈ res 4–5, city/district ≈ res 6–7.
- The user paints cells (click/drag) to claim territory. A region is stored as a **cell set**; the display polygon is derived with `cellsToMultiPolygon(cells, true)`.
- `compactCells` is used for storage/transport once a set is large; `gridDisk`/`areNeighborCells` give neighbour detection for diplomacy and border features for free.
- For organic coastlines, an **advanced freeform mode** lets the user draw a polygon (via ray–sphere picking, ADR-0005) which is immediately rasterised with `polygonToCells`. Every region therefore still ends up with a cell set, one area formula, and exact non-overlapping borders.

**Evidence (measured on the dev machine, Earth-sized sphere).** A 500 km-radius circle (784 905 km² geodesic) rasterised and re-derived:

| H3 res | cells | derived union area | error vs intended |
|--------|-------|--------------------|-------------------|
| 3 | 59 | 798 115 km² | +1.7 % |
| 5 | 2 848 | 785 339 km² | +0.1 % |
| 7 | 139 470 | 784 914 km² | +0.0 % |

Summing per-cell `cellArea` and measuring the derived union with `@turf/area` **agree**, so two independent methods cross-check each other. Accuracy improves with resolution; the residual error is a property of hex rasterisation (boundary cells are included whole), not a computation bug. Where tighter containment is needed, `polygonToCellsExperimental(ring, res, POLYGON_TO_CELLS_FLAGS.containmentFull)` is available.

**Consequences.** Painting is O(1) per interaction instead of geometry editing; areas are exact by construction (the sum of the painted cells' true areas); adjacent regions can never overlap. Each region stores `h3Resolution`, its cell list, derived geometry and measured area — so changing resolution is a re-rasterisation, not a redraw.

**Rejected.** *Freeform-only authoring* — best coastline fidelity, but much more interaction code and it turns "regions must not overlap" into a geometric solver problem; it also loses the instant area feedback the product promises. *Voronoi / plate-tectonic auto-generation* — a lovely generator that answers a question the user didn't ask and fights manual control; noted as a possible Phase 5 "generate a starting world" convenience, never the core path.

---

## ADR-0007 — Area measurement, world radius scaling, and target-area fitting

**Status:** Accepted

**Context.** "Specify the size of each region/country/city" means the app must report an authoritative area and ideally accept one as input ("make this country 500 000 km²"). Two traps: a fantasy world need not be Earth-sized, and both H3 and turf assume Earth's radius.

**Decision.** One module — `packages/shared/src/geo/area.ts` — owns every area in the app.

- For hex-painted regions the **source of truth is the sum of exact per-cell areas**: `Σ cellArea(cell, UNITS.km2)`. `@turf/area()` on the derived union is the cross-check, and the primary path for freeform/imported geometry.
- Every area is multiplied once by `(R_world / R_E)²`, where `R_E = 6371.007180918475 km` and `R_world` is `World.radiusKm` (default 6371). Verified factors: R=3000 km → ×0.2217; R=6371 → ×1.0000; R=12742 → ×4.0000.
- Canonical storage is `areaKm2` plus `cellCount`. Display converts to km² / mi² / hectares. `targetAreaKm2` records user intent separately from the measured value.
- **Resolution selection** for a target area picks the finest resolution whose average cell area is ≤ target/25 (so a region is always ≥ ~25 cells and therefore shape-bearing):

  | Target area | Resolution | ≈ cells | Cell edge |
  |-------------|-----------|---------|-----------|
  | 300 km² | 7 | ~58 | 1.4 km |
  | 12 000 km² | 5 | ~47 | 9.9 km |
  | 500 000 km² | 3 | ~40 | 69.0 km |
  | 9 000 000 km² | 2 | ~104 | 182.5 km |

  The cell set is then grown/shrunk until the measured area is within ±2 % of target.

**Evidence — verified average cell geometry (Earth radius).** Use these for *sizing heuristics only*, never for authoritative area, because individual cells differ materially from the average (verified: an exact res-5 cell measured 260.869 km² against an average of 252.904 km²).

| res | cells on globe | avg cell km² | avg edge km |
|-----|----------------|--------------|-------------|
| 0 | 122 | 4 357 449.42 | 1281.26 |
| 1 | 842 | 609 788.44 | 483.06 |
| 2 | 5 882 | 86 801.78 | 182.51 |
| 3 | 41 162 | 12 393.43 | 68.98 |
| 4 | 288 122 | 1 770.35 | 26.07 |
| 5 | 2 016 842 | 252.90 | 9.85 |
| 6 | 14 117 882 | 36.13 | 3.72 |
| 7 | 98 825 162 | 5.16 | 1.41 |
| 8 | 691 776 122 | 0.74 | 0.53 |
| 9 | 4 842 432 842 | 0.11 | 0.20 |

**Consequences.** Areas are reproducible, unit-tested against a known circle (500 km radius ⇒ 784 905 km²), and correct for any world size. Repainting surfaces an area delta in the UI so the writer can see a country grow or shrink over time.

**Rejected.** *Client-side area calculation only* — the export pipeline and API need the same numbers, and duplicated maths drifts. *Planar (flat-Earth) formulas* — wrong at the scale of countries. *Area from bounding boxes or vertex counts* — meaningless where the number is a plot device. *Storing only `targetAreaKm2`* — intent and reality must be separable; users need to see both.

---

## ADR-0008 — Relationship web via `@xyflow/react` + `d3-force`

**Status:** Accepted

**Context.** The relationship web must render entity nodes with rich cards, support drag/hover/select/click-through to lore, re-render when the timeline date changes ("show me the web as it stood then"), and stay smooth at a few hundred nodes.

**Decision.** `@xyflow/react` 12.11.6 with custom React node/edge components, laid out by `d3-force` 3.0.0. The graph is **derived state**: nodes are entities that exist `asOf` the current date, and each edge's strength and label are folded from the relationship record plus every interaction up to that date (ADR-0009, `DATA-MODEL.md` §4).

**Evidence.** Peer range `react: >=17` (React 19 fine); custom nodes/edges, handles, `MiniMap`, `Controls` and `Background` are built in; TypeScript types first-class. `d3-force` needs only `@types/d3-force` (3.0.10) as a dev dependency.

**Consequences.** Node/edge data is memoised per `(worldId, asOf, filters)` so scrubbing does not thrash the layout. Layout uses a **fixed random seed** so a given date always produces the same picture — a graph that reshuffles on every render is unusable to a writer. Above ~200 visible nodes the simulation runs in a Web Worker. Node positions are cached per date *bucket*, not per exact date.

**Rejected.** *Cytoscape.js* — the stronger renderer, but composing React content inside its canvas nodes is awkward; revisit only if a world exceeds ~500 simultaneously visible nodes. *vis-network* — drags in legacy dependencies. *Hand-rolled SVG* — we would reimplement panning, zooming, selection and handle wiring. *dagre/elkjs layered layout* — hierarchical, right for a family tree, wrong for a social web (a dedicated family-tree view may use `elkjs` later).

---

## ADR-0009 — A custom timeline component that acts as the app's time cursor

**Status:** Accepted

**Context.** The app needs a world-history timeline (eras, events) and an interaction timeline, and the selected date must drive *other* views: the relationship web, and later the political map at any year. It therefore has to work in the app's own date domain (ADR-0010).

**Decision.** Build the timeline in-house at `frontend/src/features/timeline/`: a virtualised lane layout over `order` (ordinal day), pan/zoom, and a scrubber that publishes `asOf` into a Zustand store. SVG rendering for events, with a canvas fallback for very dense eras.

**Evidence.** `vis-timeline` 8.5.4 pulls in `moment`, `@egjs/hammerjs`, `propagating-hammerjs`, `component-emitter`, `keycharm`, `xss`, `vis-data` and `vis-util`, and accepts a wide spread of `uuid` majors. More decisively, it is built around JavaScript `Date`, which cannot represent "the 12th of Frostfall, 342 AE" — it would force a lossy translation at the boundary of the app's most important feature.

**Consequences.** We own roughly 400 lines of layout and interaction code, in exchange for exact date semantics, no legacy dependencies, and a scrubber able to drive both the map and the graph. Rendering must stay virtualised: at 10 000+ events only visible lanes render.

**Rejected.** *vis-timeline* (above). *react-chrono* — card/feed presentation, not a scrubbable axis. *A charting library (recharts/visx)* — timelines are not charts; axis semantics differ.

---

## ADR-0010 — Fantasy calendars and the ordinal-day `WorldDate`

**Status:** Accepted

**Context.** Writing a history requires *dates* — "the 12th of Frostfall, 342 AE" — but every ordering, filtering and duration calculation requires a **comparable number**. JavaScript `Date` cannot express month names, 400-day years, 5-day weeks, or negative years, and string sorting of formatted dates is simply wrong ("year 9" sorts after "year 10").

**Decision.** Two collaborating concepts, owned by `packages/shared/src/geo`-adjacent code and `backend/src/lib/calendar.ts`:

1. **`Calendar`** — one per world. Stores `epochName`, `daysPerYear`, an ordered list of months with day counts, week length, a leap rule (day-count override per year-modulus) and a `displayFormat`. The real-Earth Gregorian calendar is just the default row.
2. **`WorldDate`** — `{ year, monthIndex, day, hour?, minute? }`, **always validated against its calendar** (month index in range, day ≤ that month's length for that year). Alongside it the database stores **`order`**: an integer ordinal day number relative to the calendar epoch, plus an optional `timeOfDay` minute offset for intra-day ordering.

Rules that follow from this:

- **`order` is the only field ever sorted on, ranged over, or bucketed by.** No query, index or component sorts a date string or a JS `Date`.
- Spans carry `startOrder` and `endOrder`; an `isOngoing` flag marks open-ended spans (a war that has not ended by the present day).
- Durations are computed as `endOrder - startOrder` in days and rendered as "3 years, 2 months" via the calendar.
- Negative years are supported (before the epoch), because creation myths need them.

**Consequences.** The relationship web, the timeline, the history list and the export pipeline all share one total order, so "as of date X" is a simple integer comparison. Editing a calendar's month lengths invalidates every stored `order`, so that operation is transactional: it re-computes all dates for the world and warns the user first. Calendar changes are recorded in the revision log.

**Rejected.** *JavaScript `Date` only* — cannot represent custom months or negative years, and brings timezone hazards to a fictional world. *Storing formatted strings* — unsortable. *A single float "year" value* — loses the day/month labels the writer actually writes. *A full CRON-style recurrence engine* — unnecessary; the product needs one-off events and simple spans, not recurrence rules.

---

## ADR-0011 — Export formats and the export pipeline

**Status:** Accepted

**Context.** "Make sure to create a story exporting after the world building is completed." Export must serve two different needs — a **readable compendium** (Story Bible) and a **usable manuscript** — across formats, with spoiler control, without a cloud service, and without locking the user's data in.

**Decision.** One export module in the backend (`modules/export/`) with a format-agnostic intermediate representation, then format-specific renderers:

| Output | Library | Purpose |
|--------|---------|---------|
| Markdown (+ ZIP of one file per entity) | `jszip` 3.10.2, `marked` 18.0.13 | Portability, Obsidian/Git-friendly, diffable. |
| DOCX | `docx` 9.7.1 | Editors and beta readers expect Word. Includes headings, TOC and embedded images. |
| EPUB | `epub-gen-memory` 1.1.2 | Reader-facing compendium/manuscript on an e-reader. `epub-gen` itself is unmaintained (0.1.0) — the memory fork is the maintained path and avoids temp files. |
| PDF | `pdf-lib` 1.17.1 | Phase 5+. **Not** used for laying out prose — it composes cover pages and map plates; long-form PDF is produced by the user printing the EPUB/HTML. |
| PNG | canvas snapshot of the globe | Map plates for the manuscript. |
| GeoJSON | plain serialisation | Interoperability with GIS/QGIS, and re-import. |
| JSON | plain serialisation | **Full project backup and restore — the data-ownership guarantee.** |

All renderers consume the same **export profile**: a JSON document naming the scope (which modules, entities, date range, as-of date), a template, and options (`includeSecrets`, `spoilerLevel`, image quality, unit system). Server-side, `applySpoilerFilter()` runs before rendering — never in the client.

**Consequences.** Adding a format means adding a renderer, not touching the data layer. Exports are deterministic where possible (stable key ordering) so two exports of an unchanged world are diffable. The Story Bible and the manuscript are two profiles over one pipeline, not two systems.

**Rejected.** *Print-to-PDF via a headless browser* — adds a Chromium dependency that breaks the "install and run on a laptop" constraint. *Server-side LaTeX/Pandoc* — a native toolchain requirement, contradicting ADR-0002's zero-build-tools property. *`docx` templates via an HTML-to-DOCX converter* — lossy on headings and images. *Markdown-only export* — the single most common complaint about rival tools.

---

## ADR-0012 — Spoilers are a first-class, field-level concern

**Status:** Accepted

**Context.** Worldbuilders routinely hold information the reader must not see yet: a traitor's true allegiance, a future war, a character who is already dead. In rival tools this is handled by convention — a separate note file, a "GM" section, or simply remembering. Convention fails, and the failure is embarrassing: it leaks into a document handed to a beta reader.

**Decision.** Spoilers are structural.

- A shared `spoilerLevel` enum: `public` (0) · `internal` (1) · `secret` (2). It is available on any *entity* and on any *field group* within it (e.g. `character.secrets`, `event.consequence`).
- Every read endpoint accepts an `asViewer` context (`maxSpoilerLevel`). Default in the UI is `internal`; exports default to `public` unless the profile says otherwise.
- `applySpoilerFilter(entity, level)` lives in `packages/shared/src/geo`-sibling module `spoiler.ts`, and is applied **server-side in the API and again in the export pipeline**. Client-side-only filtering is forbidden (`AGENTS.md` §3.6).
- The UI renders anything above the current level as a blurred/locked block with an explicit reveal action, so the writer can still see that something is hidden.

**Consequences.** A single context value drives correctness everywhere, and a reader-facing export can be produced with confidence. Tests must assert that a `secret` entity never appears in a `public` export payload.

**Rejected.** *A separate "GM notes" field* — only works for one entity type and is invisible to querying. *Naming conventions / prefixes* — silently unenforceable. *Client-side filtering* — a data leak, since the payload already reached the browser.

---

## ADR-0013 — Frontend state: TanStack Query for server data, Zustand for UI, Tailwind + Radix for presentation

**Status:** Accepted

**Context.** The UI is data-dense and editor-like: the same entity appears in a map panel, a lore panel, a graph and a timeline, and edits in one must reflect in the others. It also holds a lot of genuinely ephemeral state (selected tool, globe camera, draft geometry, timeline scrub position, spoiler view level).

**Decision.**

- **TanStack Query 5** owns all server data: caching, background refetch, and — critically — **invalidation by entity key**, so editing a character's name refreshes the graph and the timeline panels that read it. Mutation hooks in `features/<name>/api.ts`.
- **Zustand 5** owns only ephemeral UI state, in small slices: `useTimelineStore` (`asOf`), `useMapStore` (tool, camera, selection, draft cells), `useViewStore` (spoiler level, units, theme). Server data never lives in Zustand.
- **Tailwind CSS 4** (via `@tailwindcss/vite`) plus **Radix UI 1.6.7** primitives and `class-variance-authority`/`tailwind-merge`/`clsx`, following the shadcn/ui convention of *owning* the component source in `frontend/src/components/ui/`. Icons from `lucide-react`.
- The frontend never computes a domain value (area, date order, duration, word count) that the backend also needs — it calls the API instead, so there is exactly one implementation.

**Consequences.** Derived views (the relationship web) subscribe to `asOf` from Zustand *and* to server data from Query, and recompute with `useMemo` at the store boundary. Because the globe is imperative (Three.js) while the rest of the app is declarative, the globe is the one component allowed to hold a renderer ref — bridged into React through `onGlobeReady` and a small imperative facade.

**Rejected.** *Redux Toolkit* — more ceremony than this app needs, and Query already removes most server-state complexity. *Putting server data in Zustand* — reimplements caching and invalidation badly. *A component library with a fixed runtime theme (MUI/Ant)* — fights the design language and bloats the bundle. *CSS-in-JS* — unnecessary runtime cost next to Tailwind 4.

---

## ADR-0014 — MongoDB as the store (supersedes ADR-0002)

**Status:** Accepted

**Context.** The project was designed on SQLite + Drizzle. Direction changed to a **document store**: data should be stored as documents, not relational tables. This also fits the domain better than the relational model did — a region is naturally one document (geometry + cell list + profile + biome), an interaction is one document (participants + the deltas it causes), and the app's headline output is a JSON export that a document store maps onto directly. The relational design needed EAV tables for template-defined custom fields, a junction table for every many-to-many, and recursive CTEs for the region tree.

**Decision.** **MongoDB 8.3.4** running locally, via the **official `mongodb` Node driver 7.6.0**, with no ODM (ADR-0018). Documents are modelled embedding-first (ADR-0016); evolution uses `schemaVersion` instead of migration files (ADR-0017); the server runs as a single-node replica set so transactions work (ADR-0015).

**Evidence — every row verified on the dev machine before this ADR was written.**

| Check | Result |
|-------|--------|
| Server availability | `mongod` v8.3.4 + `mongosh` 2.9.2 **already installed** (`mongodb-bin` 8.3.4-1, AUR). No Docker needed. |
| Replica set | `--replSet rs0` + `rs.initiate(…)` reaches `isWritablePrimary: true`. |
| Multi-document transaction | Commit across `worlds` + `regions` was atomic; a `throw` inside `withTransaction` left **0** documents behind. |
| Spatial queries | A `2dsphere` index + `$geoIntersects` with a point correctly matched a polygon region. **SQLite could not do this without the optional RTree extension.** |
| Full-text search | `$text` returned the right document for a term present only in the body. |
| Region tree, no recursion | An `ancestorIds` array + index answered "everything under this continent" in one query — no recursive CTE. |
| Embedded updates | `arrayFilters` updated one participant inside an interaction without rewriting the others. |
| Date-range query | An integer `order` field with `$lte` + `$or` answered "which events are active as of day 350". |
| Document size ceiling | Embedded H3 cells cost **~25–27 bytes each**, so 16 MB allows roughly **630 000 cells per region** (ADR-0016 sets the caps). |

**Consequences — gained.** Real spatial indexing, array-containment queries that replace join tables and recursive CTEs, one document per entity that serialises straight to the API and to the JSON backup, and template-defined custom fields with no schema change at all.

**Consequences — costs, and their handling.**

| Cost | Handling |
|------|----------|
| No migration files | `schemaVersion` per document + lazy upgrade on read; index changes declared in code, applied idempotently on boot (ADR-0017). |
| Transactions require a replica set | Single-node replica set started by `npm run db:start` (ADR-0015). |
| 16 MB document limit | H3 cell arrays are capped and resolutions tiered (ADR-0016). |
| `$text` limits | One text index per collection, no substring search. Acceptable for v1 (F-LORE-3 is specified against these limits). |
| Needs a running local service | `mongod` is already installed, so this is cheap — but `npm run dev` now depends on `npm run db:start`. |
| RAM pressure | 7.6 GB total with ~1.4 GB free; WiredTiger's default cache would be ~3.3 GB, so the instance is pinned to **512 MB** (verified). |
| Licence | mongod is **SSPL-1.0**. Fine for a locally run personal tool; SSPL obligations trigger on offering it *as a service* to third parties. Relevant only if Store-y is ever hosted commercially. |

**README principle 1 is amended.** "Local-first" still holds (no cloud, no account, offline-capable), but "the project is one SQLite file" becomes **one MongoDB data directory plus the uploads folder**, and a local `mongod` is now a prerequisite.

**Rejected.** *Stay on SQLite* — contradicts the explicit direction, and documents genuinely fit this domain better. *MongoDB Atlas* — needs a network and an account, breaking local-first. *Embedded Mongo-likes* (`@seald-io/nedb` 4.1.2, LokiJS 1.5.12, RxDB 17.5.0) — would avoid the service, but offer no transactions, no `2dsphere`, no `$text`, and the real server is already installed, so the trade buys nothing. *FerretDB* — a Mongo-wire front end over SQL: not packaged here, and reintroduces the relational layer we are removing. *Mongo for some entities, SQLite for others* — two stores, two consistency models, no benefit.

---

## ADR-0015 — Run `mongod` as a single-node replica set

**Status:** Accepted

**Context.** Multi-document transactions are essential: committing a painted region writes the region, recomputes the world's area totals and appends a revision; importing a project writes ~20 collections. **A standalone `mongod` does not support transactions at all** — they require a replica set. Without them we would hand-roll compensating rollback logic and risk torn writes.

**Decision.** Run a **single-node replica set** inside the project, exposed as `npm run db:start`.

```bash
# verified recipe — data lives with the project, no root required
mongod --dbpath backend/data/mongo \
       --port 27017 --replSet rs0 --bind_ip 127.0.0.1 \
       --wiredTigerCacheSizeGB 0.5 \
       --fork --logpath backend/data/mongo/mongod.log

mongosh --port 27017 --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
```

Connection string: `mongodb://127.0.0.1:27017/storey?replicaSet=rs0`

**Evidence.** Verified end to end on this machine: the first start reached `isWritablePrimary: true`; a transaction spanning two collections committed atomically and rolled back cleanly on error; after a shutdown and restart the node returned to primary **without re-running `rs.initiate`** (config persists in `local.system.replset`); and `--wiredTigerCacheSizeGB 0.5` was confirmed active, where the default would have been ~3.3 GB on this 7.6 GB machine.

**Consequences.** Transactions, change streams and retryable writes all become available. The driver must be given `?replicaSet=rs0`, and **tests must run against a replica set** — a plain `mongod` makes every transactional test fail in a confusing way. A fresh machine needs two steps; `db:start` performs both idempotently.

**Rejected.** *Standalone `mongod`* — no transactions; unacceptable for a project import or a region commit. *The system-wide `mongodb.service`* — the unit exists but is **disabled**; enabling it needs root, moves data outside the project, and makes `npm run dev` depend on machine state rather than the repository. *A three-node replica set* — right for production, absurd for a single-author local app. *Atlas* — network dependency.

---

## ADR-0016 — Embedding-first document modelling

**Status:** Accepted

**Context.** Document databases punish heavy joining, but they invite the opposite failure: unbounded arrays inside documents that hit the 16 MB limit and force full-document rewrites. Without written rules, agents will drift toward either extreme.

**Decision.** Four rules govern where data lives.

1. **Owned, bounded, and read with its parent → embed.** Region profile inside the region; interaction participants *and the deltas the interaction causes* inside the interaction; calendar months inside the calendar; arc beats inside the arc; scene cast inside the scene.
2. **Unbounded growth, or queried on its own → separate collection.** `revisions`, `entityLinks`, `assets`, `articles`, `historicalEvents`. A relationship's deltas are therefore embedded in their **interaction**, never accumulated on the relationship document.
3. **Trees use a materialised path.** Each region stores `ancestorIds: string[]`. "Everything under this continent" is one indexed query; cycle detection is an array check; no recursive CTE.
4. **Cross-cutting many-to-many uses one `entityLinks` collection** with compound indexes on **both** directions, since links are traversed from either end.

Two supporting conventions: `worldId` is duplicated onto every document so a world can be exported or deleted with simple filters and no joins; and documents that reference others keep a small denormalised `displayName`, refreshed by the service on rename, so hot paths never need `$lookup`.

**Evidence.** `arrayFilters` updated one embedded participant without rewriting the others (verified). Embedded H3 cells cost ~25–27 bytes each, so 16 MB is reached at roughly **630 000 cells** (verified). `$geoIntersects` on a `2dsphere` index matched an embedded polygon correctly (verified). An `ancestorIds` containment query returned all descendants of a continent in one indexed query (verified).

**Consequences — including the hard caps.**

- **Embedded H3 cells are capped at 300 000 per region** — a deliberate safety margin below the measured ~630 000 ceiling, leaving room for geometry and profile. Beyond it, cells live in a companion `regionCells` collection keyed by `(regionId, resolution)`. The tiered resolutions keep real regions far below the cap (a res-7 continent is ~139 000 cells).
- Embedded edits always use `arrayFilters`, never read-modify-write of a whole array.
- Renaming an entity fans out `displayName` updates — accepted, and performed inside the same transaction as the rename.

**Rejected.** *Normalise everything* — defeats the purpose of a document store and turns every read into a `$lookup` chain. *Aggressive `$lookup` on hot paths* — works, but slower and harder to reason about than embedding or a denormalised name. *Accumulating relationship deltas on the relationship document* — unbounded array, 16 MB risk, expensive rewrites; rejected outright. *A separate deltas collection* — considered, but it re-creates the join the fold exists to avoid, and interaction deletion would no longer cascade naturally.

---

## ADR-0017 — Schema evolution without migration files

**Status:** Accepted

**Context.** A document store has no `ALTER TABLE`, and there is no migration-file tool in the dependency set. Documents written by v0.4 of the app will still be in the user's database when v0.7 reads them. Shape drift without a mechanism is how data silently rots.

**Decision.**

- Every document carries `schemaVersion` (integer, currently 1), and the current version per collection is declared once in code (`CURRENT_SCHEMA`).
- **Lazy upgrade on read.** Services check the version when a document is loaded; if stale, they run a pure, tested upgrader (`upgradeRegionV1toV2(…)`) and write the upgraded document back when it is next saved. The upgrade cost is amortised over normal use instead of paid all at once at startup.
- **Indexes are the one thing the server owns.** They are declared in `backend/src/db/indexes.ts` and applied idempotently on boot via `npm run db:indexes`.
- A `schemaMigrations` collection records `(collection, fromVersion, toVersion, ranAt)` for rare one-off backfills, which are run explicitly — never automatically on boot.
- Additive optional fields never need a version bump; only shape changes do.

**Consequences.** Old documents can never ambush the code, because every read path validates the version first. A document carrying a *future* `schemaVersion` is rejected with `SCHEMA_VERSION_UNSUPPORTED` instead of being silently mangled. The JSON export format carries its own `schemaVersion` too, so cross-install restores are versioned end to end.

**Rejected.** *Eager migrations on boot* — rewriting every document at startup is slow, risky, and turns a version bump into a downtime event. *Schemaless drift* (no version field at all) — guarantees pain by Phase 3. *A file-based migration framework for Mongo* (umzug/migrate-mongo) — adds a tool for a problem lazy upgrades solve better at this scale.

---

## ADR-0018 — Official `mongodb` driver, not Mongoose

**Status:** Accepted

**Context.** A document store still needs a way to talk to Node. The ecosystem's default answer is Mongoose, but this project already has a schema authority: the Zod schemas in `packages/shared` that define every API shape, custom-field contract and backup-file format.

**Decision.** Use the **official `mongodb` driver 7.6.0** directly, with thin typed repository functions over it. Zod remains the only place field shapes are defined: documents are parsed with the same schemas on the way out of the repository, so a stale document is caught by validation at the trust boundary.

**Consequences.** No second schema language to keep in sync, no ODM magic on hot paths (the relationship fold, the region commit), and the driver API is what the tests were written against. Validation is explicit rather than implicit, which fits a codebase where agents — not incidental knowledge — do most of the writing.

**Rejected.** *Mongoose 9.10.1* — a fine ODM, but its schema definitions would duplicate every Zod schema, its middleware hooks hide write paths that the revision log must see, and its populated-document types fight Zod inference. The marginal ergonomics are not worth two sources of truth. Revisit only if document validation becomes genuinely painful.
