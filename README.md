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

**Phase 0 in progress.** The monorepo scaffold (T-0.1) is in place: `backend/`, `frontend/` and `packages/shared/` are npm workspaces that install, typecheck, test and run together. The authoritative documents for anyone (human or AI agent) working in this project are in [`docs/`](./docs) — see the index below and read [`AGENTS.md`](./AGENTS.md) before writing code.

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

- **Frontend** — React 19 + TypeScript, Vite 8, Tailwind CSS 4, Zustand (UI state), TanStack Query (server state), **react-globe.gl** (Three.js/WebGL 3D globe), **@xyflow/react** (relationship web), d3-force (graph layout).
- **Backend** — Node 24, Fastify 5, Zod 4 (validation, shared with the frontend), the **official MongoDB Node driver** (no ODM), REST under `/api/v1`.
- **Database** — **MongoDB** (document store, not relational), run locally as a single-node replica set so multi-document transactions are available. `mongod` is already installed here; no Docker, no cloud account.
- **Geospatial engine** — **h3-js** (hexagonal global grid: region painting, exact areas, neighbour/border detection) + **@turf/area** & geodesic maths (true measured area in km²/mi², scaled for non-Earth-sized worlds), with real spatial queries via MongoDB `2dsphere` indexes.
- **Export** — Markdown, `docx`, `epub-gen-memory`, `pdf-lib`, plus a full JSON backup/restore.
- **Monorepo** — npm workspaces (`backend`, `frontend`, `packages/shared`).

Exact pinned versions and the reasoning behind every choice are in [`docs/TECH-DECISIONS.md`](./docs/TECH-DECISIONS.md).

## Quickstart

```bash
npm install          # installs all workspaces
npm run db:start     # starts a local mongod as a single-node replica set (once per session)
npm run db:indexes   # applies the declared index manifest (idempotent)
npm run seed         # loads the demo world (not yet implemented — arrives in T-0.9)
npm run dev          # runs API (:4000) + web app (:5173) together
npm test             # vitest, all workspaces
```

`mongod` must be installed locally (it already is on the dev machine — see [`docs/TECH-DECISIONS.md`](./docs/TECH-DECISIONS.md) ADR-0015); no Docker, no cloud.

## Design principles

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

