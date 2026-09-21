# ARCHITECTURE

How Store-y is assembled, why the boundaries fall where they do, and how data moves through it. Read alongside [`DATA-MODEL.md`](./DATA-MODEL.md) (entities) and [`TECH-DECISIONS.md`](./TECH-DECISIONS.md) (why these libraries).

---

## 1. Runtime topology

```
┌─────────────────────────── Browser (SPA) ────────────────────────────┐
│  React 19 + Vite 8 + Tailwind 4                                      │
│                                                                      │
│  routes ──► features/<name>/  ──► components/ui/                     │
│                 │                                                    │
│        ┌────────┴─────────┐                                          │
│        │ TanStack Query   │  server state (regions, events, …)       │
│        │ Redux Toolkit    │  UI state (tool, camera, asOf, spoiler)  │
│        └────────┬─────────┘                                          │
│                 │                                                    │
│      react-globe.gl (WebGL)   @xyflow/react + d3-force (graph)       │
│      custom timeline (SVG)    export download (blob)                 │
└────────────────┬─────────────────────────────────────────────────────┘
                 │  fetch /api/v1/*  (JSON; multipart for uploads)
┌────────────────▼─────────────────────────────────────────────────────┐
│                     Fastify 5 API (Node 24)                          │
│                                                                      │
│  routes ──► service ──► repo ──► mongodb driver ──► local mongod (RS)      │
│    │          │           │                                                    │
│  Zod parse  rules/     typed BSON              backend/data/mongo              │
│  (contract) sessions                                                          │
│                                                                      │
│  src/contract/: zod schemas · types · geo (h3, area, projection)    │
│  src/lib/: calendar.ts · spoiler.ts · geometry.ts · revisions.ts     │
│  src/modules/export/: IR ──► md | docx | epub | pdf | geojson | json │
└──────────────────────────────────────────────────────────────────────┘
                 │
        backend/data/uploads/  (textures, portraits, attachments)
```

**Development.** `cd backend && npm run db:start` starts the project's `mongod` as a single-node replica set (ADR-0015); `cd backend && npm run dev` starts the API on `:4000` and `cd frontend && npm run dev` starts Vite on `:5173`. Vite proxies `/api/*` to the API, so the browser sees one origin and CORS is never needed.

**Production (v1).** `cd backend && npm run build` emits `backend/dist`; the API serves it via `@fastify/static` alongside `/api/v1` and `/uploads`. One process, one port, no external services.

## 2. Package boundaries

| Package | May import | Must never import |
|---------|-----------|-------------------|
| `backend/src/contract/` | only `zod`, `h3-js`, granular turf packages | backend app code, frontend |
| `backend/` (rest) | `backend/src/contract/` | `frontend` |
| `frontend/` | nothing from backend (reads types from API responses) | `backend` |

`backend/src/contract/` is deliberately dependency-light: it holds Zod schemas, inferred types, enum constants, and **pure** maths — `geo/h3.ts`, `geo/area.ts`, `geo/projection.ts`, `dates/calendar.ts`, `spoiler.ts`. Pure functions with no I/O, trivially testable. It is not bundled into the browser (the frontend gets types from API responses, not from this package).

**Belongs in `contract`:** Zod schemas, inferred types, enum constants (region kinds, relation types, error codes), and **pure** maths — `geo/h3.ts`, `geo/area.ts`, `geo/projection.ts`, `dates/calendar.ts`, `spoiler.ts`. Pure functions with no I/O, trivially testable.

**Does not belong in `contract`:** anything touching the DB, the filesystem, or a React component.

## 3. Request lifecycle (a write)

"Commit a painted region" as the worked example:

1. `RegionMapPage` collects draft cells in `useMapStore` and calls `useCommitRegion()` (a TanStack Query mutation).
2. `features/regions/api.ts` `POST`s `/api/v1/regions/bulk/cells` with a body validated by `commitRegionSchema` from `shared`.
3. Fastify parses the body; a failure returns `400` with the standard error envelope before any service code runs.
4. `region.service.ts` executes the business rules inside a driver session (`session.withTransaction`): validate the parent chain (no cycles), validate containment, ensure no cell is claimed by a sibling unless repaint is allowed, derive geometry (`cellsToMultiPolygon`), compute `areaKm2` (`Σ cellArea × radiusScale`), then write.
5. `region.repo.ts` performs the driver write and records a `revision` — all inside the same session, so a region commit, its revision and the world's area totals land atomically.
6. The service returns the domain object; the route serialises it.
7. TanStack Query invalidates `['regions', worldId]`, refreshing the globe, the region list and any view reading region names. The optimistic draft is discarded.

**Invariant:** validation happens twice by design — Zod at the boundary (shape) and the service (meaning). Neither substitutes for the other.

## 4. Read lifecycle with a time cursor

The relationship web is the clearest expression of the app's data flow, because it combines server data, a client-side cursor and a derived computation:

```
useTimelineStore(asOf)  ──┐
                          ├──► useRelationshipsAsOf(worldId, asOf) ──► fold ──► React Flow nodes/edges
useQuery(relationships) ──┘        (server: relationships + deltas where
                                    interaction.endOrder <= asOf)
```

- The **server** returns relationships plus every `RelationshipDelta` whose interaction ends at or before `asOf`. Filtering server-side keeps the payload small and enforces spoiler rules centrally.
- The **client** folds the base relationship and its ordered deltas into the displayed affinity/status. The fold is a pure function in `shared`, so it is unit-testable and produces exactly what an export would.
- Layout is memoised per `(worldId, asOf, filterHash)`, so scrubbing inside one date bucket does not re-run the force simulation (ADR-0008).

The same pattern generalises: **the timeline date is a cursor, and every time-aware view is a query against `order`.** The map will use it too (borders at year X, Phase 6).

## 5. The geospatial pipeline (the part that is easy to get wrong)

```
pointer event ──► ray–sphere intersection ──► toGeoCoords() ──► {lat,lng}
                                                                    │
                                            [lat,lng] conversion in shared/geo
                                                                    │
                                    h3.latLngToCell(lat,lng,res) → "8a2a1072b59ffff"
                                                                    │
                                            draft cell set (Redux store)
                                                                    │
                                       POST /bulk/cells  →  compactCells()
                                                                    │
                cellsToMultiPolygon() ──► GeoJSON MultiPolygon [lng,lat]  (wire + DB)
                                                                    │
                Σ cellArea(cell) × (R_world/R_E)²  ──► areaKm2     (authoritative)
                                                                    │
                          react-globe.gl polygonsData (+ hexPolygonsData while painting)
```

Hard rules that keep this path correct (restated from `AGENTS.md` §11 because they are the ones agents break):

1. **Two coordinate orders exist.** GeoJSON/DB/wire is `[lng, lat]`; H3 is `[lat, lng]`. Conversion happens only in `shared/geo/`.
2. **`cellArea(h3Index, unit)` takes a cell**, not a resolution. Resolution averages come from `getHexagonAreaAvg(res, unit)` and are for sizing heuristics only.
3. **Every area is scaled once** by `(R_world/R_E)²` inside `geo/area.ts` — nowhere else.
4. **Picking uses ray–sphere maths against `getGlobeRadius()`**, not raycasting the globe object (the atmosphere intercepts), and never hand-rolled spherical trigonometry.
5. **Draft state lives on the client; committed state lives on the server.** Nothing reaches the DB until the user commits.

## 6. Globe rendering pipeline

- **Surface texture.** Generated once per world into an offscreen canvas (seeded elevation/terrain noise, ocean→land colour ramp), converted to a data URL for `globeImageUrl`. A user-uploaded equirectangular image overrides it. Cached per world, invalidated only when surface settings change.
- **Layer order (bottom → top):** base texture → `hexPolygonsData` (only while painting, or when the hex layer is toggled on) → `polygonsData` (regions; the selected region gets a `polygonAltitude` lift) → `arcsData` (trade routes/migrations, later phase) → `pointsData` / `labelsData` (places) → `ringsData` (selection pulse).
- **Colour is data.** A region's fill comes from type, parent, faction and selection state, resolved by a pure `regionColor(region, context)` helper so the map and the legend can never disagree.
- **Performance.** Only the selected region sends individual hexes; everything else sends derived polygons. Regions outside the viewport are culled by bounding box. `polygonCapCurvatureResolution` is tuned per region size.

## 7. Cross-cutting concerns

| Concern | Mechanism |
|---------|-----------|
| **Spoilers** | `spoilerLevel` on entities and on field groups; `applySpoilerFilter()` applied in the API read layer *and* the export pipeline (ADR-0012). |
| **Audit / undo** | A `revisions` document written by services on every mutation (`entityType`, `entityId`, `action`, `before`, `after`). Powers the entity history panel and "restore this version" (all inside the mutating session). |
| **Soft delete** | `deletedAt` on all major entities; a Trash view restores within 30 days; "empty trash" is the only hard delete. |
| **Concurrency** | A `version` integer per entity; a `PATCH` carrying a stale `expectedVersion` returns `409 STALE_WRITE` and the UI offers reload-or-overwrite. |
| **Errors** | One envelope, stable `SCREAMING_SNAKE_CASE` codes in `shared/constants/error-codes.ts`, mapped to HTTP status by a Fastify error handler. |
| **Logging** | Structured JSON via Fastify's logger, request id on every line. No user content in logs. |
| **Assets** | Uploads stored at `backend/data/uploads/<checksum>/<name>`; the DB holds metadata plus a relative path. Content-addressed, so re-uploading a portrait dedupes. |
| **Export** | A format-agnostic intermediate representation feeds every renderer, so adding a format never touches the data layer (ADR-0011). |

## 8. Performance budgets

| Interaction | Budget |
|-------------|--------|
| Globe first paint | < 2 s (integrated graphics) |
| Paint cell toggle → visual feedback | < 50 ms (optimistic, no round-trip) |
| Commit 500 cells | < 300 ms server time |
| Relationship web re-render on scrub (200 nodes) | < 100 ms excluding layout; layout worker-assisted |
| Timeline render (2 000 events) | < 100 ms, visible lanes only |
| Any list endpoint | paginated; ≤ 200 items per response |
| Initial JS bundle (excluding the lazy globe route) | < 400 kB gzipped |

## 9. Deployment and operations (v1)

- **Single process + local `mongod`.** `node backend/dist/server.js` serves the API, `/uploads`, and the built SPA from one port; `mongod --dbpath backend/data/mongo --replSet rs0` holds the data. `PORT`, `MONGO_URI`, `MONGO_DB`, `UPLOAD_DIR` come from the environment (see `.env.example`).
- **Backup** is copying `backend/data/` — plus, preferably, a JSON export in the user's own storage for portability across installs.
- **Indexes** are declared in `backend/src/db/indexes.ts` and applied idempotently by `npm run db:indexes`; a mismatch between the manifest and a fresh database is a startup warning, not silent drift. There are no migration files (ADR-0017).
- **No telemetry, no outbound calls.** The app is fully functional while offline; the only network activity is the browser talking to its own origin.
- **Recovery.** If the DB is lost, the last JSON export restores the world; that path is tested by T-0.8, not left to hope.
