# Store-y — Story World Engine

> A local-first web app for fiction writers. **Build the world first, then track everything that happens in it.**

Store-y combines a worldbuilding database, a true 3D globe map builder with *measured* land areas, a custom-calendar history engine, a character/relationship web that can be rewound to any date, and a one-click Story Bible exporter. It is the single source of truth for a novel, series, or TTRPG campaign.

---

## The problem this solves

Writers who build a world end up with the world spread across a wiki tool, a drawing app, a spreadsheet of dates, a folder of character notes, and a document of plot beats. Nothing is joined up, so:

- the map has no numbers — you cannot answer *"how big is this country?"*;
- the timeline breaks the moment the world has its own calendar or year zero;
- relationship tracking is a static diagram that cannot answer *"were they allies when this scene happens?"*;
- exporting means copy-pasting, and secret/GM-only information leaks into reader-facing docs.

Store-y treats a fictional world as a **graph of connected entities with dates**, not a pile of pages, and it makes the map a first-class, measurable object.

## The six core modules

| # | Module | What it does |
|---|--------|--------------|
| 1 | **World & Map Builder** | A real 3D globe. Draw continents/countries/cities, and Store-y computes the true geodesic area (km²/mi²) of every region. Set a *target* area and the region is fitted to it. |
| 2 | **Lore & Articles** | Typed, templated articles with custom fields, backlinks, tags and spoiler levels. Regions get structured vegetation/biome/climate. |
| 3 | **History Maker** | Define your world's own calendar (months, week-length, leap rules), then lay down eras and dated events with cause → effect links. |
| 4 | **Character Builder** | Characters with traits, affiliations, arcs, secrets, and typed relationships to each other and to factions/places. |
| 5 | **Interactions & Relationship Web** | Record what actually happens between characters. The web is **time-travelable**: scrub the timeline to any date and the graph redraws as it stood then. |
| 6 | **Story Tracker & Exporter** | Arcs→Chapters→Scenes, each pinned to a world date and place. Export a Story Bible to Markdown, DOCX, EPUB, PDF or JSON with spoiler filtering. |

## Status

**Phase 0 in progress.** Two independent packages sit side by side in this folder: `backend/` (the API) and `frontend/` (the web app). Each has its own `package.json`, its own `node_modules`, its own build and deploy path. The API contract (Zod schemas, error envelope, pagination, world-date types) lives in `backend/src/contract/` and is owned by the backend; the frontend reads types from API responses, not from a shared TypeScript package. The authoritative documents for anyone (human or AI agent) working in this project are in [`docs/`](./docs) — see the index below and read [`AGENTS.md`](./AGENTS.md) before writing code.

## Documentation index

| Document | Purpose |
|----------|---------|
| [`AGENTS.md`](./AGENTS.md) | **Start here.** Agent/contributor contract: hard rules, conventions, commands, task workflow, definition of done. |
| [`docs/PLAN.md`](./docs/PLAN.md) | The master plan: vision, scope, module breakdown, milestones, risks. |
| [`docs/FEATURES.md`](./docs/FEATURES.md) | Feature-by-feature specification with explicit acceptance criteria. |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System design, module boundaries, request/data flows, map-rendering pipeline. |
| [`docs/DATA-MODEL.md`](./docs/DATA-MODEL.md) | Every entity, field, relationship, and the SQL schema. |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | Phased, agent-sized task list with dependencies and deliverables. |
| [`docs/TECH-DECISIONS.md`](./docs/TECH-DECISIONS.md) | ADR log — chosen stack with verified versions and rejected alternatives. |
| [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md) | Code style, naming, module layout, testing and git workflow. |

## Technology at a glance

- **Frontend** — React 19 + TypeScript, Vite 8, Tailwind CSS 4, **Redux Toolkit** (UI state — reducers, `dispatch`, typed store), TanStack Query (server state), **react-globe.gl** (Three.js/WebGL 3D globe), **@xyflow/react** (relationship web), d3-force (graph layout).
- **Backend** — Node 24, Fastify 5, Zod 4 (validation, shared with the frontend), the **official MongoDB Node driver** (no ODM), REST under `/api/v1`.
- **Database** — **MongoDB** (document store, not relational), run locally as a single-node replica set so multi-document transactions are available. `mongod` is already installed here; no Docker, no cloud account.
- **Geospatial engine** — **h3-js** (hexagonal global grid: region painting, exact areas, neighbour/border detection) + **@turf/area** & geodesic maths (true measured area in km²/mi², scaled for non-Earth-sized worlds), with real spatial queries via MongoDB `2dsphere` indexes.
- **Export** — Markdown, `docx`, `epub-gen-memory`, `pdf-lib`, plus a full JSON backup/restore.
- **Monorepo** — two independent packages (`backend/`, `frontend/`) side by side; no workspace, no shared TypeScript package.

Exact pinned versions and the reasoning behind every choice are in [`docs/TECH-DECISIONS.md`](./docs/TECH-DECISIONS.md).

## Quickstart

```bash
# Install each side independently (each has its own node_modules):
cd backend && npm install
cd ../frontend && npm install

# Backend needs a local MongoDB (already installed on the dev machine):
cd backend
npm run db:start     # starts a local mongod as a single-node replica set (once per session)
npm run db:indexes   # applies the declared index manifest (idempotent)
npm run seed         # loads the demo world (not yet implemented — arrives in T-0.9)

# Run the two sides. They can be started from their own folders or together:
cd backend && npm run dev     # API on :4000
cd frontend && npm run dev    # web app on :5173 (proxies /api → localhost:4000)

# Or run both in one terminal from the root folder:
(cd backend && npm run dev) & (cd frontend && npm run dev)

# Tests (run per side, not from the root):
cd backend && npm test
cd frontend && npm test
```

`mongod` must be installed locally (it already is on the dev machine — see [`docs/TECH-DECISIONS.md`](./docs/TECH-DECISIONS.md) ADR-0015); no Docker, no cloud.

## Design principles

### Backend (`backend/`)

The backend is a Node 24 + Fastify 5 service that can be deployed several ways:

**1. Plain Node process** (any VPS, any host that runs Node):
```bash
cd backend
npm install          # or npm ci if you have package-lock.json
npm run build        # tsc → dist/
node dist/server.js  # reads PORT env (default 4000)
```
Set `PORT`, `MONGO_URI`, `MONGO_DB` via environment variables (see `.env.example`).

**2. Docker** (any Docker host — VPS, Render, Fly, AWS, local):
```bash
cd backend
docker build -t storey-backend .
docker run -p 4000:4000 \
  -e PORT=4000 \
  -e MONGO_URI=mongodb://host:27017/storey?replicaSet=rs0 \
  -e MONGO_DB=storey \
  storey-backend
```
The `Dockerfile` in `backend/` is a two-stage build (compile in stage 1, thin runtime in stage 2). See `backend/.dockerignore` for what's excluded from the build context.

**3. Render** (Web Service):
- Connect the `backend/` folder as a Git repo (or the whole repo and set the root directory to `backend/`).
- Build command: `npm install && npm run build`
- Start command: `node dist/server.js`
- Set environment variables: `PORT`, `MONGO_URI`, `MONGO_DB`.
- Render provides its own MongoDB or you can point it at an external MongoDB (Atlas or self-hosted).

**4. Vercel** (Node.js serverless function — works but is not the primary target):
- Vercel can run Node serverless functions. The backend is not designed as a serverless app (it holds a MongoDB driver connection, runs a replica-set-aware mongod locally for transactions), so Vercel is viable only if you externalize MongoDB and accept cold-start connection behavior. Prefer a VPS or Docker host for the backend; use Vercel for the frontend if you want.

### Frontend (`frontend/`)

The frontend is a static SPA (Vite build → `dist/`). Deploy the `dist/` folder to any static host:

- **Vercel**: connect `frontend/` as a Git repo; it auto-detects Vite and builds `npm run build`; deploys `dist/` statically.
- **Cloudflare Pages**, **Netlify**, **S3 + CloudFront**, **nginx**, etc.: build with `npm run build` in `frontend/` and upload `dist/`.
- The frontend proxies `/api` requests to the backend at runtime (see `frontend/vite.config.ts` in dev; in production the API base URL is an env var or config).

### Together

The two sides are independent deployables. A typical production setup:

- Backend on a VPS / Docker host / Render, with MongoDB nearby (same network, or Atlas).
- Frontend on a static host (Vercel, Cloudflare, S3), pointing at the backend's public API URL.

They do not need to be on the same machine, in the same repo, or even deployed by the same team.

1. **Local-first and owned by the writer.** One MongoDB data directory plus an uploads folder *is* the project, and `mongod` runs on your machine — no cloud, no account. JSON export/import is a first-class feature, never a paywall — no lock-in.
2. **The map has numbers.** Every region reports a real measured area; "make this country 500,000 km²" is a supported instruction.
3. **Time is a first-class type.** Worlds with custom calendars sort correctly because every date is normalised to an absolute day number.
4. **State is versioned in time, not overwritten.** Relationships and borders have validity ranges, so any view can be rendered "as of" a date.
5. **Spoilers are structural.** Secret/GM-only content is a field-level flag that every view and export respects.
6. **Offline-capable, single-user by default.** No account required to start writing; collaboration is an explicit later phase.

## Non-goals (v1)

- Real-time multi-user collaboration (planned Phase 6).
- Real-Earth GIS import (GeoTIFF/Shapefile/DEM) and satellite tile sources.
- AI story generation.
- Manuscript **formatting** for print/book layout — Store-y tracks story structure and exports documents; it is not a typesetter.
- Mobile-native apps (the web UI is responsive instead).

## Licence

Unlicensed / private by default; no third-party code is vendored. See [`docs/TECH-DECISIONS.md`](./docs/TECH-DECISIONS.md) for every dependency and its licence.

