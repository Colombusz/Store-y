# AGENTS.md — Contributor & Agent Contract

**Read this file first, then `docs/PLAN.md` and `docs/CONVENTIONS.md`, before writing any code.**

This document is the contract for any human or AI agent working in this repository. It is deliberately explicit: the project is built by many hands over many sessions, so consistency matters more than individual cleverness.

---

## 1. What this project is

**Store-y** is a local-first web app that helps fiction writers build a world and then track everything that happens inside it.

The six modules (details in `docs/FEATURES.md`):

1. **World & Map Builder** — 3D globe, drawable regions with *measured* geodesic areas.
2. **Lore & Articles** — templated articles, custom fields, backlinks, spoilers.
3. **History Maker** — custom fantasy calendars, eras, dated events, cause → effect.
4. **Character Builder** — characters, traits, affiliations, secrets, arcs.
5. **Interactions & Relationship Web** — character encounters that mutate a time-travelable relationship graph.
6. **Story Tracker & Exporter** — Arc → Chapter → Scene, exported as Markdown / DOCX / EPUB / PDF / JSON.

Current state: **Phase 0 scaffold in place** (`T-0.1`–`T-0.3` done: two independent packages (`backend/`, `frontend/`), backend-owned API contract in `backend/src/contract/`, DB connection/index manifest). Frontend is still a placeholder. Live status lives in [`docs/ROADMAP.md`](./docs/ROADMAP.md) — trust its status markers over this line.

## 2. Document map — what to read for what

| I need to… | Read |
|------------|------|
| Understand the product and scope | `docs/PLAN.md` |
| Know exactly what to build + acceptance criteria | `docs/FEATURES.md` |
| Understand the system design and data flow | `docs/ARCHITECTURE.md` |
| Touch the database or API payloads | `docs/DATA-MODEL.md` |
| Find the next task to do | `docs/ROADMAP.md` |
| Know why a library/approach was chosen | `docs/TECH-DECISIONS.md` |
| Know how to name, format, and test code | `docs/CONVENTIONS.md` |

If a doc and the code disagree, **the docs are the source of truth** — fix the code, not the doc, unless you are deliberately amending the design, in which case update the doc in the same change.

## 3. Hard rules (never violate)

1. **TypeScript strict everywhere.** No `any` in committed code (`unknown` + narrowing is fine). No non-null assertions (`!`) except in tests.
2. **Validate at the boundary.** Every HTTP request body/query/param is parsed with a Zod schema from `backend/src/contract/schemas/`. Never trust raw input deeper in the stack.
3. **All geographic data is GeoJSON `[lng, lat]` on the wire and in the DB.** H3 functions take `[lat, lng]`. **Conversion must go through the helpers in `backend/src/contract/geo/` — never inline the swap.** (This is the single most likely source of silent bugs in this codebase.)
4. **All areas are computed in `backend/src/contract/geo/` and scaled by the world's radius.** Never hardcode Earth's 6371 km in feature code.
5. **All world dates are stored as a `WorldDate` object *plus* an integer `order` (absolute day number).** Never sort by string dates. Never store a date as a JS `Date`.
6. **Spoiler rule:** any field that can hold secret/GM-only content must have a companion `spoilerLevel` and be filtered by a shared `applySpoilerFilter()` helper in the API *and* in exports. Never leak secrets into an export.
7. **No feature is complete without tests.** See §7.
8. **No direct DB access from route handlers.** Route → service → repository. Always.
9. **Money-free, cloud-free, Docker-free.** The app must run on a laptop with `npm install && npm run dev`. No external services required at runtime.
10. **Never commit** `backend/data/` (the `mongo/` data dir, logs and uploads), `.env`, or build output.
11. **No monolith files.** No source file may exceed **300 lines**. No single function may exceed **50 lines**. No module folder may hold more than ~7 files at one level. When a file approaches the limit, split it — extract a sub-module, a `lib/` helper, or a folder with an `index.ts` barrel — in the same change, not a later "cleanup" pass. See `docs/CONVENTIONS.md` §9.

## 4. Toolchain (verified on this machine)

| Tool | Version | Note |
|------|---------|------|
| Node | v24.18.0 | Test runner: **Vitest**, not the built-in `node:test`, for consistency across workspaces. |
| npm | 12.0.1 | Workspaces only; **pnpm/yarn are not installed, do not introduce them.** |
| Python | 3.14.6 | Available but **not used** by this project. |
| Docker | **not installed** | Never require it. No containerised DB. |
| MongoDB | 8.3.4 (`mongod` + `mongosh` 2.9.2) | Already installed (`mongodb-bin` from the AUR). Runs locally as a **single-node replica set** via `npm run db:start`. Never Atlas, never Docker. |

## 5. Repository layout (canonical)

```
Store-y/
├── AGENTS.md                  # this file
├── README.md                  # human-facing overview
├── package.json               # backend package manifest — its own deps, its own build
│   ├── tsconfig.json          # extends tsconfig.base.json (root)
├── tsconfig.base.json         # shared strict compiler options
├── .env.example               # documented env vars (PORT, DB_PATH, UPLOAD_DIR)
├── docs/                      # the plan (see §2)
├── backend/                   # Fastify API + official mongodb driver (no ODM)
│   ├── data/                  # GITIGNORED: mongo/, mongod.log, uploads/
│   ├── src/
│   │   ├── server.ts          # boot: env → db → app → listen
│   │   ├── app.ts             # builds the Fastify instance (no listen) — used by tests
│   │   ├── env.ts             # env parsing with Zod (MONGO_URI, MONGO_DB, PORT, …)
│   │   ├── db/                # client.ts, collections.ts, indexes.ts, upgrade.ts
│   │   ├── plugins/           # auth.ts, errors.ts, static.ts, multipart.ts
│   │   ├── lib/               # pure helpers: ids.ts, revisions.ts, uploads.ts
│   │   └── modules/<name>/    # one folder per feature module (see §6)
│   └── test/                  # cross-module integration tests
├── frontend/                  # Vite + React 19 SPA
│   ├── index.html
│   ├── vite.config.ts         # dev proxy /api → :4000
│   └── src/
│       ├── main.tsx, App.tsx, routes.tsx
│       ├── features/<name>/   # one folder per feature (see §6)
│       ├── components/ui/     # design-system primitives (Button, Dialog, …)
│       └── lib/               # api.ts (fetch client), queryClient.ts, stores/
└── src/
    └── contract/              # API contract OWNED by backend: Zod schemas, types,
        ├── geo/               # geodesy: h3.ts, area.ts, project.ts, geometry.ts
        ├── dates/             # calendar.ts: toOrder, formatWorldDate, durations
        ├── relationships/     # foldRelationshipState.ts (the time-travel fold)
        ├── consistency/       # contradiction checks for the story dashboard
        ├── constants/         # enum values, region kinds, relation types, error codes
        └── index.ts
```

**Rule:** if a type or validation rule is needed by both sides, it lives in `backend/src/contract/`. Neither `backend` nor `frontend` may import from the other — the frontend gets types from API responses, not from a shared TypeScript package.

> **Note:** only `AGENTS.md`, `README.md`, `docs/` and the empty `backend/` and `frontend/` folders exist today. Everything else in the tree above is the **target** layout, created by T-0.1 in Phase 0.

## 6. Module conventions

Every backend module `backend/src/modules/<name>/` contains exactly:

| File | Responsibility |
|------|----------------|
| `<name>.routes.ts` | Fastify plugin: declares paths, parses input with shared Zod schemas, calls the service. **No business logic.** |
| `<name>.service.ts` | Business rules, orchestration, transactions. Returns domain objects. **No SQL, no HTTP.** |
| `<name>.repo.ts` | Mongo driver queries only (thin typed functions — no ODM). **No business rules.** |
| `<name>.test.ts` | Unit tests for the service (repo faked), integration tests via `app.inject()`. |

That is the **starting shape, not a ceiling** — a module that outgrows it splits per `docs/CONVENTIONS.md` §9 (sub-modules, a `lib/` folder, or a sub-folder with an `index.ts` barrel). Example: the exporter grows `renderers/{index,markdown,docx,epub,pdf}.ts` instead of one 600-line `renderers.ts`. The `routes/service/repo` separation itself is never relaxed to save space.

Every frontend feature `frontend/src/features/<name>/` contains:

| File/dir | Responsibility |
|----------|----------------|
| `api.ts` | Typed calls to the backend, hooks via TanStack Query (`useRegions()`, `useUpdateRegion()`). |
| `components/` | Feature-local components — **the primary building blocks of the feature**. One component per file, page-sized pages assembled from them. |
| `hooks/` | `use-*.ts` behaviour hooks (painting, cursor, camera) so components stay declarative. |
| `store.ts` | Redux Toolkit slice — **only** ephemeral UI state (selection, camera, draft geometry), changed only by `dispatch`ing actions from `slice.actions`. Server data never lives here. |
| `<Name>Page.tsx` | Route entry point — a thin composition root, not an implementation. |

The frontend is **component-first**: pages are compositions, logic lives in hooks, primitives graduate to `components/ui/` at the third consumer. Size budgets (hard rule 11) apply per component file; a feature outgrowing its folder splits the same way a backend module does (`CONVENTIONS.md` §5, §9).

## 7. Definition of Done

A task is done only when **all** of these hold:

1. `npm run typecheck` passes with zero errors.
2. `npm run lint` passes.
3. `npm test` passes; new behaviour is covered by tests (service logic unit-tested; API contracts integration-tested via `app.inject()`).
4. Any new/changed API shape is expressed in `backend/src/contract/schemas/` and consumed by the backend; the frontend reads the resulting types from API responses.
5. Any new/changed document shape has a `schemaVersion` bump, an upgrader, matching Zod schemas, and updated index declarations if new query paths were added — verified by `npm run db:indexes` on a scratch database.
6. New env vars are added to `.env.example` and parsed in `backend/src/env.ts`.
7. The relevant doc in `docs/` is updated in the same change (feature spec, data model, or ADR).
8. No new dependency was added without an ADR entry in `docs/TECH-DECISIONS.md`.
9. Nothing secret/GM-only can leak: exports and read endpoints filter by `spoilerLevel`.
10. Multi-document writes were made in a transaction (`session.withTransaction`) — verified against a replica set, not a standalone `mongod`.

## 8. Commands

Commands run per-package (each side has its own `package.json` and its own `node_modules`). The root `package.json` is a placeholder and does not orchestrate anything.

| Command | Where | Purpose |
|---------|-------|---------|
| `npm install` | `backend/` and `frontend/` | Install that side's dependencies (each gets its own `node_modules`). |
| `npm run dev` | `backend/` or `frontend/` | Run that side alone (`backend`: API on `:4000`; `frontend`: web on `:5173`). |
| `npm run build` | `backend/` or `frontend/` | Type-check and build that side. |
| `npm run typecheck` | `backend/` or `frontend/` | `tsc --noEmit` for that side. |
| `npm run lint` / `npm run format` | `backend/` or `frontend/` | ESLint (flat config) / Prettier write for that side. |
| `npm test` / `npm run test:watch` | `backend/` or `frontend/` | Vitest for that side only. |
| `npm run db:start` | `backend/` | Starts the project's `mongod` as a single-node replica set (once per session). |
| `npm run db:indexes` | `backend/` | Applies the declared index manifest, idempotently. |
| `npm run db:shell` | `backend/` | Opens `mongosh` against the project database. |
| `npm run seed` | `backend/` | Load the demo world (see `docs/ROADMAP.md` Phase 0). |

The frontend dev server proxies `/api/*` to `http://localhost:4000`, so the app never needs CORS in development.

## 9. API conventions

- Base path is `/api/v1`. Resource segments are plural, kebab-case: `/api/v1/regions`, `/api/v1/historical-events`.
- Standard verbs: `GET /collection`, `POST /collection`, `GET /collection/:id`, `PATCH /collection/:id`, `DELETE /collection/:id` (soft delete → trash).
- Every request body/query/params object is a Zod schema from `backend/src/contract/schemas/`; the route fails with `400` before any service code runs.
- **Error envelope** (always):
  ```json
  { "error": { "code": "REGION_PARENT_CYCLE", "message": "Human readable.", "details": {} } }
  ```
  Codes are stable `SCREAMING_SNAKE_CASE` strings defined in `backend/src/contract/constants/error-codes.ts`.
- **IDs** are UUIDv7-style strings generated with the built-in `crypto.randomUUID()` — no dependency, lexicographically time-ordered.
- **Timestamps** are ISO-8601 UTC strings. **World dates are never timestamps** (see hard rule 5).
- **Pagination** is cursor-based: `?limit=50&cursor=<id>`; the response is `{ items: [...], nextCursor: string | null }`. Never return an unbounded collection.
- **Optimistic concurrency**: mutable entities carry `version: number`. `PATCH` accepts `expectedVersion`; a mismatch returns `409 STALE_WRITE` so the UI can offer a merge.
- **Deletes are soft** (`deletedAt`) and recoverable from the Trash view for 30 days; no hard delete endpoint in v1 except "empty trash".
## 10. How to work as an agent in this repo

1. Read `docs/ROADMAP.md`, pick the **lowest-numbered task whose dependencies are complete and which is not already claimed**.
2. Announce the task in your first message, then implement it end-to-end — do not leave half-finished scaffolding.
3. Work in small, coherent increments. One task = one focused change set. **Do not refactor code outside your task's scope**; note it under "Found while working" instead.
4. **Watch the size budgets while you work** (hard rule 11 / `CONVENTIONS.md` §9). A file crossing 300 lines or a function crossing 50 is split **in the same change** — extract a sub-module, a `lib/` helper, or promote the file to a folder with an `index.ts` barrel. Do not leave a monolith for a later cleanup pass.
5. Before declaring done, run the relevant side's gate from its folder: `cd backend && npm run typecheck && npm run lint && npm test` (or `cd frontend && ...` for frontend tasks).
6. Update the affected doc(s) and mark the task complete with a one-line note about anything a follow-up task must know.
7. Commit with Conventional Commits including the task ID:
   `feat(geo): measured region area with world-radius scaling [T-1.3]`
   Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`.
8. If blocked, stop and report: what you tried, the exact error, what decision you need. Never invent a workaround that violates §3.

## 11. Known pitfalls (all verified on the dev machine — do not rediscover these)

1. **Coordinate order.** GeoJSON is `[lng, lat]`; **H3 is `[lat, lng]`.** Ring conversion must go through `backend/src/contract/geo/`. Symptom of getting it wrong: regions render rotated/mirrored or land in the wrong hemisphere.
2. **H3 v4 naming.** The correct names are `getHexagonAreaAvg(res, unit)` and `getHexagonEdgeLengthAvg(res, unit)` — *not* `averageHexagonArea`. `cellArea(h3Index, unit)` takes an **h3 index**, not a resolution; passing a resolution silently returns a constant for every value (verified: 4106166.3345 km² for res 0–9), which quietly corrupts every area in the app.
3. **`polygonToCells(ring, res)`** takes the ring as `[lat, lng]` and accepts no flags. For containment control use `polygonToCellsExperimental(ring, res, flags)` with `POLYGON_TO_CELLS_FLAGS` (`containmentCenter` | `containmentFull` | `containmentOverlapping` | `containmentOverlappingBbox`).
4. **H3 assumes an Earth-sized sphere.** All H3 areas/edge lengths and `@turf/area` use Earth's radius `R_E = 6371.007180918475 km`. For a non-Earth world multiply every area by `(R_world / R_E)²` **exactly once**, inside `backend/src/contract/geo/area.ts`.
5. **Unit discipline.** `@turf/area()` returns **m²**; `cellArea(..., UNITS.km2)` returns **km²**. Do not divide by `1e6` twice — it yields plausible-looking but 10⁶× wrong numbers.
6. **`h3-js` has no `exports` map** (only `main`, `module`, `umd:main`). Verified working via `require` and via default/namespace/named ESM imports on Node 24. If a bundler mis-resolves it, add `h3-js` to Vite's `optimizeDeps.include`.
7. **The `react-globe.gl` ref is null before `onGlobeReady`.** Gate imperative calls (`pointOfView`, `toGeoCoords`) behind that flag, and dispose the renderer on unmount — React StrictMode double-mounts in dev and otherwise leaks WebGL contexts.
8. **Globe picking:** use ray–sphere intersection against `getGlobeRadius()` with the camera from the ref, rather than raycasting the globe object — the atmosphere mesh intercepts raycasts. Convert the hit point with `toGeoCoords()`, never with hand-rolled `atan2` maths.
9. **Dates.** Never store a world date as a JS `Date`, and never sort by a date string — sorting happens on the integer `order` field (see `docs/DATA-MODEL.md` §3).
10. **The Mongo startup contract (there are no SQLite pragmas here).** The instance **must** run as a replica set (`?replicaSet=rs0`, see ADR-0015), the WiredTiger cache stays at **0.5 GB** on this machine, and every multi-document write runs inside `session.withTransaction`. A standalone `mongod` silently breaks transactions.
11. **Geometry size, now with a hard ceiling.** Cap stored vertices per region (simplify on save beyond ~10 000 points) **and** cap embedded H3 cells at **300 000** (measured: ~25–27 bytes per cell, so the 16 MB document limit breaks at roughly 630 000 cells). Beyond the cap, cells live in `regionCells` (ADR-0016).
12. **Spoilers.** Filtering must happen server-side *and* in the export pipeline. A client-side-only filter is a data leak.
13. **`sparse: true` does NOT work on compound unique indexes.** Verified: it only skips documents when *all* indexed fields are missing, so the first slug-less region indexed as `(worldId, null)` and the second failed with `E11000`. Use `partialFilterExpression: { slug: { $type: 'string' } }` for every optional-but-unique field.
14. **Transactions require the replica set.** Tests must connect with `?replicaSet=rs0` to an initialised instance. If a transactional test fails with a confusing topology error, the `mongod` under test is almost certainly standalone — check `db.hello().setName` first.
15. **Don't fight the document model.** Reach for `$lookup` last, not first: embed bounded data, duplicate `worldId`/`displayName`, and keep cross-cutting edges in `entityLinks`. A `$lookup` on a hot path means the schema is wrong (ADR-0016).
16. **One text index per collection.** MongoDB allows exactly one `$text` index per collection, and `$text` does no substring matching. Full-text search is specified against these limits (F-LORE-3) — do not promise prefix search.

## 12. Open product questions (defaults are implemented; do not block on them)

| # | Question | Default the plan assumes |
|---|----------|--------------------------|
| Q1 | Single-user local app, or accounts/multi-user in v1? | Single local user, no login. The auth plugin is written but disabled. |
| Q2 | Globe surface: user-uploaded texture, or procedurally generated terrain? | Procedural (elevation noise → canvas texture), with upload as an override. |
| Q3 | Region authoring: hex-painting only, or freeform polygons too? | Both. Hex painting is the default; freeform polygon is the advanced mode. |
| Q4 | Is "story export" an encyclopaedic Story Bible, a prose manuscript, or both? | Both, as selectable export profiles. |
| Q5 | Must users be able to start from real Earth coastlines? | No. A blank sphere is the default; import is a later enhancement. |

If a task cannot proceed without changing one of these defaults, **stop and ask the user** rather than guessing.

