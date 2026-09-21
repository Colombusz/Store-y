# CONVENTIONS

How code in this repository looks, so that many hands produce one coherent codebase. Where a rule exists to prevent a specific mistake, the mistake is named.

---

## 1. TypeScript

- `strict: true` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, set once in `tsconfig.base.json`, never locally relaxed.
- **No `any`** in committed code. Use `unknown` plus a Zod parse or a type guard. If a third-party type is wrong, write a narrow local interface rather than casting to `any`.
- **No non-null assertions (`!`)** outside tests. If a value can be null, handle it — the globe ref genuinely *is* null before `onGlobeReady`, and that bug class is exactly why this rule exists.
- **No `enum`.** Use `as const` arrays/objects plus a Zod enum, so values are runtime-validated too:
  ```ts
  export const REGION_KINDS = ['continent','country','province','city','district','landmark','ocean'] as const;
  export type RegionKind = (typeof REGION_KINDS)[number];
  export const regionKindSchema = z.enum(REGION_KINDS);
  ```
- **Prefer `readonly`** on arrays and props that must not be mutated, and `Readonly<T>` for domain objects crossing a boundary.
- **Exhaustive switches** on unions end with `default: assertNever(x)`, so adding a variant breaks the build in exactly the right places.
- **Branded types** for the two identifiers that are easy to confuse (`WorldId`, `EntityId`) — cheap insurance against passing a `worldId` where a `regionId` belongs.

## 2. Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Files (TS, non-component) | `kebab-case` | `region.service.ts`, `error-codes.ts` |
| React components | `PascalCase.tsx`, one component per file | `RegionMapPage.tsx`, `CharacterCard.tsx` |
| Hooks | `use-*.ts` file, `useXxx` export | `use-regions.ts` → `useRegions()` |
| Types/interfaces | `PascalCase`, no `I` prefix | `Region`, `WorldDate` |
| Zod schemas | `camelCase` + `DocSchema` for documents, `+Schema` for everything else | `regionDocSchema`, `createRegionSchema` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_CELLS_PER_COMMIT` |
| API paths | kebab-case, plural | `/api/v1/historical-events` |
| Error codes | `SCREAMING_SNAKE_CASE` | `REGION_OUTSIDE_PARENT` |
| Tests | mirror the source path, `.test.ts` | `region.service.test.ts` |
| Feature folders | plural, kebab-case | `features/regions/` |
| Collections | camelCase **plural** | `historicalEvents`, `entityLinks`, `regionCells` |
| Document fields | camelCase | `areaKm2`, `h3Resolution`, `ancestorIds`, `startOrder` |
| Document `_id` | string (UUIDv7) | never `ObjectId` in v1 |
| Date sub-objects | nested `WorldDate` + `order` | `start: { year, month, day, order }` — never a `Date` |

### Domain vocabulary — use these words and no synonyms

Mixed vocabulary is the fastest way to make a codebase unreadable.

`World` · `Region` (a geographic area with cells) · `Place` (a point of interest) · `Article` (a lore page) · `Era` · `HistoricalEvent` · `Character` · `Relationship` (typed and persistent) · `Interaction` (a dated encounter) · `RelationshipDelta` (the change an interaction causes) · `Story` · `Arc` · `Chapter` · `Scene` · `Asset` · `Revision` · `WorldDate` · `order` (the ordinal day).

Do **not** introduce "location", "node", "record", "entry", "event" (except `HistoricalEvent`), or "link" (it is `EntityLink`) as competing terms.

## 3. Commenting

- Comment **why**, never **what** — the code already says what.
- Every non-obvious geospatial conversion, radius scaling, or date-ordinal computation carries a one-line comment naming the rule: `// H3 takes [lat,lng]; our GeoJSON is [lng,lat] — convert via shared/geo.`
- Public functions in `shared/` and `backend/src/lib/` carry short JSDoc stating units and coordinate order, e.g. `/** Area in km², already scaled by the world radius. Input cells are H3 indices. */`
- `TODO` comments must carry a task id: `// TODO(T-3.1): replace with calendar-aware duration`.

## 4. Backend module shape

Route → service → repo, always (hard rule 8). Concretely:

```ts
// regions.routes.ts — shape only, no rules
app.post('/regions/bulk/cells', async (req, reply) => {
  const body = commitRegionSchema.parse(req.body);        // shared schema
  return reply.code(201).send(await regionService.commitCells(body, ctx(req)));
});
```
```ts
// regions.service.ts — rules only, no driver code at the top level
export async function commitCells(input: CommitRegionInput, ctx: Ctx): Promise<RegionDoc> {
  const session = ctx.mongo.startSession();
  try {
    return await session.withTransaction(async () => {
      validateHierarchy(input, await loadParent(ctx, input.parentId)); // rules
      const cells = compactCells(input.cells);
      const geometry = cellsToMultiPolygon(uncompact(cells), true);
      const areaKm2 = regionAreaKm2(cells, ctx.world.radiusKm);   // shared/geo
      const region = await regionRepo.upsert(ctx, { ...input, cells, geometry, areaKm2 }, session);
      await revisionRepo.record(ctx, 'region', region._id, 'commit_cells', null, region, session);
      return region;
    });
  } finally { await session.endSession(); }
}
```

Rules:
- Services take an explicit `Ctx` (`worldId`, `viewerSpoilerLevel`, `actorId`, `mongo`) — never read request state from a global or from module scope. The session travels on `Ctx` or as an explicit parameter.
- Services throw typed domain errors (`AppError` carrying a code); the Fastify error handler maps them to an HTTP status plus the standard envelope.
- Repos are thin typed driver functions; they never call other repos — composition happens in the service.
- **One transaction per multi-document write** (`session.withTransaction`). Single-document writes need no session.
- Embedded edits use `arrayFilters`; renames fan out `displayName` in the same session.
- Anything used by more than one module moves to `backend/src/lib/` and gets its own tests.

## 5. Frontend architecture — component-first

**Components are the organising unit of the frontend, the way routes/service/repo are for the backend.** Pages are thin compositions of components; logic lives in hooks; the file budget of §9 applies per component.

### Component discipline

- **One component per file** (`PascalCase.tsx`), one job per component. A component that does data fetching, layout *and* canvas interaction is three components.
- **Size limits (§9) apply to components with teeth.** A component file over 300 lines or a component function over 50 lines is split — a page becomes sections (`MapToolbar`, `RegionInspector`, `LayerPicker`), a section becomes primitives. No `RegionMapPage.tsx` monolith that renders the whole feature.
- **Hooks carry behaviour, components carry markup.** Any non-trivial logic (`useRegionPainting`, `useTimelineCursor`, `useGlobeCamera`) lives in a `use-*.ts` hook next to its consumers, so components stay declarative and hooks stay testable without rendering.
- **Feature folders own their components; `components/ui/` owns primitives.** A component is promoted to `components/ui/` only when a *third* consumer appears — not before (premature abstraction), not later (copy-paste is worse). Between those points it lives in the feature's `components/` folder.
- **Split escalation for components** mirrors §9: a big component extracts sub-components; shared presentation logic extracts a hook (`use-*.ts`); pure visuals (formatting, colour mapping) extract to `lib/` helpers; tests split with the source (`RegionPanel.test.tsx` mirrors `RegionPanel.tsx`).
- One-way data flow: `api.ts` → TanStack Query → component. Components never call `fetch` directly.
- **Query keys are hierarchical and centralised** via a `queryKeys` helper so invalidation is precise: `queryKeys.regions.list(worldId)`, `queryKeys.regions.detail(id)`.
- Mutations are optimistic **only** where the interaction demands it (painting, dragging); everything else waits for the server. Every optimistic write must define its conflict behaviour.
- No component computes a domain value (area, `order`, duration, word count) — call the API or `shared`. The sole exception is display-only formatting.
- Props are explicit. Avoid spreading `...rest` into domain components; it hides the API.
- `useMemo`/`useCallback` only where a measured cost exists (globe layer data, force layout, timeline lanes) — never reflexively.

### What a page is allowed to be

A `<Name>Page.tsx` is a **composition root**: layout, wiring data to components, routing concerns — nothing else. If it exceeds ~100 lines it is already wrong: the region map page should read as a table of contents (`<GlobeCanvas/>`, `<RegionInspector/>`, `<PaintPalette/>`, `<TimelineCursor/>`), not as an implementation.

## 6. Testing

| Layer | Tool | What to test |
|-------|------|--------------|
| `packages/shared` | Vitest | Pure maths: area scaling, H3 conversion round-trips, calendar `order` maths, spoiler filtering, geometry helpers, relationship-fold fixtures, schema upgraders. **These are the highest-value tests in the repo.** |
| `backend/src/lib` | Vitest | Calendar, revisions, geometry validation, embedded-edit operators. |
| Backend services | Vitest + a scratch database on the local replica set | Business rules with a real (throwaway) database — cycles, containment, target fitting, export filtering, transaction commit/rollback. Tear down with `dropDatabase()`. |
| Backend repos | Vitest + the test database | Each declared index in `indexes.ts` is actually used: explain winning plans for the five hottest queries (region commit, subtree list, fold read, `$text` search, point-in-polygon assignment). |
| Backend routes | Vitest + `app.inject()` | Contract shape, status codes, error envelopes, pagination. No ports. |
| Frontend | Vitest + `@testing-library/react` + jsdom | Component behaviour and hooks. Query the DOM by role/label, not test ids. |
| End-to-end | Playwright (Phase 5+) | The success list in `PLAN.md` §8. |

**Test rules**
- A bug fix ships with a test that fails before the fix.
- Never mock `shared` maths — it is pure and fast; testing against the real thing is the point.
- Use fixed fixtures with a **fixed world radius and a fixed seed** so geospatial assertions are deterministic.
- Test names state the behaviour: `rejects a child region outside its parent`, not `test validateHierarchy`.
- No network access, no real timers, no `Date.now()` dependence in assertions.

## 7. Git and documentation

- Conventional Commits with the task id: `feat(geo): measured region area with world-radius scaling [T-1.3]`.
- One logical change per commit; keep diffs reviewable. Do not mix a refactor with a feature.
- Never commit `backend/data/`, `.env`, `dist/`, or generated export files.
- **A change that alters behaviour, the API, or the schema updates `docs/` in the same commit.** If reality and the docs disagree at review time, the change is incomplete.
- New dependency ⇒ new ADR in `TECH-DECISIONS.md` (same commit).

## 8. UI conventions

- Dark theme first; light theme is a later toggle. Colour is never the only signal (icon or label accompanies it) — several of this app's users are writers staring at it for hours, and some are colour-blind.
- Region/relationship colours come from a small named palette in `shared/constants`, not from ad-hoc hex values in components.
- Every destructive action confirms and is expressed as an explicit verb ("Delete region", not "OK").
- All numbers show units and use a consistent formatter (`formatArea`, `formatDistance`, `formatWorldDate`) — never `toLocaleString()` inline.
- **Accessibility baseline:** every interactive element is keyboard reachable, visible focus rings are kept, dialogs trap focus (Radix does this), and the globe's critical actions (select region, open list) have non-canvas equivalents in the sidebar. Icon-only buttons carry `aria-label`.
- Loading, empty and error states are designed for every panel — no blank divs, no infinite spinners without a timeout message.

## 9. File and folder size limits — no monoliths

Monolith files are how a codebase dies quietly: one 900-line `regions.service.ts` and every agent session starts with re-reading what the last one forgot. These limits are **hard**, checked at review, and never "temporary".

### Budgets

| Unit | Limit |
|------|-------|
| Source file | **300 lines** |
| Function (excluding declarations/imports) | **50 lines** |
| Files in one folder (one level, excluding `index.ts` barrels) | **~7** |

There is no "except for the file that obviously needs it". If a file needs to be bigger, it is telling you it has more than one job.

### How to split — in the same change, not a cleanup pass

The moment a file approaches a budget (don't wait for the violation), split it using the escalation ladder:

1. **Extract a sub-module** — `regions.service.ts` splits into `regions.service.ts` + `region-hierarchy.ts` when hierarchy validation outgrows its host. Same folder, same naming rules (§2).
2. **Extract a `lib/` helper** — pure logic with no I/O (`cellsToMultiPolygon` maths, calendar arithmetic) moves to the module's `lib/` folder with its own tests. Anything two modules need graduates to `packages/shared` or `backend/src/lib/`.
3. **Promote to a folder with an `index.ts` barrel.** A file that keeps growing becomes a folder with the same name; callers change nothing:
   ```
   modules/export/
   ├── export.routes.ts       # slim: parse + delegate only
   ├── export.service.ts      # orchestration only
   ├── export.repo.ts
   ├── renderers/            # was going to be a 600-line renderers.ts
   │   ├── index.ts           # barrel — the only public surface
   │   ├── markdown.ts
   │   ├── docx.ts
   │   ├── epub.ts
   │   └── pdf.ts
   └── export.test.ts
   ```
   Public surface of the folder = what `index.ts` re-exports. Deep imports (`export/renderers/docx`) are forbidden outside the folder.
4. **Split tests with the source.** `export.test.ts` gets one `describe` per source file; if the tests outgrow 300 lines first, they mirror the split (`renderers/markdown.test.ts`).

### What splitting is *not*

- **Not a rewrite.** Move code; don't "improve" it in the same commit. One logical change per commit (§7).
- **Not an excuse for pass-through shells.** If a "split" produces `a.ts` that only calls `b.ts`, you've moved the monolith, not split it. Split along responsibility seams: rules vs. queries vs. formatting vs. types.
- **Not barrel-stuffing.** A folder that re-exports one giant `impl.ts` is still a monolith with extra files.

### If you find a violator

Fix it in the change that touches that file anyway (AGENTS.md hard rule 11); if the file is outside your task's scope, record it in the task's "Found while working" notes instead of refactoring outside scope.
