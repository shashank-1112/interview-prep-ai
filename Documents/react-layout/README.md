# Stall Layout Planner

An exhibition floor-plan editor built with React 18, TypeScript (strict), Konva and Zustand. It is a rebuild of the Angular `stall-layout-planner` component. The data model is field-for-field identical, so layouts stay wire-compatible with the existing API and with data already saved in browsers.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest unit + component tests
npx playwright install chromium   # once
npm run test:e2e     # Playwright drag/resize/keyboard/perf tests (starts its own dev server)
npm run build        # typecheck + production build
```

On first load the app seeds the same demo layout as the Angular app (3 hangars, 42 stalls).

## Project layout

```
src/
  domain/      types (wire model + form types), constants (STALL_SIZE_PRESETS, CORNER_ORIENTATIONS, colours),
               geometry (snap, overlap, corner polygon), layoutOps (generate/align/distribute/merge/split/filter/bulk),
               booking (status transitions), schema (zod runtime validation), seed (demo data)
  store/       layoutStore (Zustand: data, snapshot history, selection, modals), actions (user commands: confirm → commit → toast)
  repository/  LayoutRepository interface, LocalStorageLayoutRepository (versioned keys + migration), MemoryLayoutRepository (tests)
  canvas/      GroundStage, HangarEditorStage, HangarEditor (lazy), StallShape, AnnotationShape, GridShape, Konva helpers
  forms/       GenerateGround, Hangar (add/edit), GenerateStalls, StallEdit (add/edit), Annotation — react-hook-form + zod, all lazy
  panels/      Details, BulkActions + Filter (lazy), QuickActions, ConfirmDialog, ShortcutsHelp (lazy), CanvasA11y
  hooks/       useKeyboardShortcuts, useZoomPan, useUndoRedo, useElementSize
e2e/           Playwright specs (ground, editor, bulk, perf)
```

## How it works

**Units.** All data is in layout units (metres or feet), exactly as stored. The canvas draws at 20 px per unit at 100 % zoom (`PX_PER_UNIT`). Conversion only happens in `canvas/units.ts`. Stall `x`/`y` are relative to their hangar. Hangar-scoped annotations are also hangar-relative, and ground annotations (`hangarId: null`) use ground coordinates.

**State and undo.** Layout data is immutable. `commit(recipe)` pushes the previous `StallLayoutData` object onto the undo stack. That makes a snapshot one reference, and unchanged hangars/stalls are shared between snapshots. Every mutation goes through `commit`: move, resize, add, delete, generate, booking and bulk. History is capped at 50 steps. After each commit, undo or redo, selections are pruned so they never point at deleted entities. Changes autosave through the repository 400 ms after they land, and Ctrl+S saves immediately.

**Konva primitives replace the hand-rolled pointer math.**
- Hangars, stalls and annotations are `Group`s with `draggable`. Snapping and clamping happen in `dragmove`.
- Resizing uses one `Transformer` per stage bound to the current selection. Its `boundBoxFunc` snaps every edge to `ground.gridSize`, keeps the box inside the hangar or ground, and enforces a minimum of `gridSize × 2`. For hangars, the minimum also covers the stalls they contain.
- Nothing is committed to Zustand while a pointer is down. Nodes are moved imperatively and the store updates once on `dragend`/`transformend`. A rejected change, such as a hangar dropped onto another hangar, snaps the node back.

**Performance with 500+ stalls.**
- *Ground view:* each hangar's stalls are a non-listening, bitmap-cached group. Dragging a hangar moves one bitmap. A stall click is resolved by hit-testing rectangles in hangar-local coordinates.
- *Hangar editor:* unselected stalls live in one cached group on a static layer. Selected stalls render in a separate active layer with the Transformer and marquee, so only that small layer redraws during a drag. Pressing an unselected stall selects it, re-mounts it in the active layer, and continues the same press as a drag with `node.startDrag()`.
- Caches are re-rendered at the settled zoom level (`smartCache`), so they stay sharp. Caching is skipped when a sharp bitmap would be too large.
- The grid is a single `Shape` whose `sceneFunc` draws every line in one path.
- The perf spec loads 768 stalls. It measures frame intervals while dragging in both views and asserts a median under 25 ms. Local runs measure 16.7 ms, which is a steady 60 fps.

**Code splitting.** The initial bundle contains the ground stage only. The Hangar Editor, every form modal, the bulk panel and the shortcuts overlay are `React.lazy` chunks.

**Accessibility.** Konva nodes are not in the DOM, so each view renders a parallel list of buttons, one per hangar, stall and annotation, with descriptive labels. The list is visually hidden until it receives keyboard focus. A polite live region announces the current selection. Modals trap focus, close on Esc and restore focus afterwards.

## Site: roads, parking and outside counters

The ground now sits inside a **site surroundings** area, drawn as a dashed band around it. Ground-level annotations use ground coordinates, so anything outside the ground has negative `x`/`y` or values beyond `ground.width`/`height`. The data model gains no new fields. `AnnotationType` just gains `'road'` and `'parking'`.

| Type | Where it may go | Notes |
| --- | --- | --- |
| Road | Always **outside** the ground, ground level only | Laid beside a chosen side, flush or with a gap. The length defaults to that side's length. Drops or resizes that touch the ground are reverted. |
| Parking | **Inside or outside** the ground, never across its edge, ground level only | Painted bays and an estimated capacity of 25 m² per car, including aisles |
| Ticketing counter, gift counter, washroom | Inside or outside at ground level. Inside only when scoped to a hangar. | The three counter-type markers share one rule set |
| Gates, open area, walking path | Inside the ground or hangar, as before | |

The rules live in `src/domain/site.ts`. Auto-placement, dragging, the Transformer and the form all apply the same rules.

- **Placement:** `placeBesideGround` keeps an item within its side's span, so nothing slides round a corner onto another side. It slides the item along the side, then steps outward until it clears other roads, parking and counters.
- **Site margin:** the margin is `max(15, 30% of the longest ground side)`, and it only limits dragging. The site grows to include whatever is placed further out.
- **Hangars:** parking and counters inside the ground can't overlap a hangar, and a hangar can't be dropped onto them.
- **Flush items:** drags snap the offset rather than the absolute position, and resizing only snaps the edges being dragged. Roads flush against an edge, including off-grid widths like 3.6 m, stay flush.
- **Cancelling:** pressing Esc during a resize cancels it. Shortcuts pause while a drag or resize is in progress.
- **Keyboard:** in Edit layout mode, arrow keys nudge the selected hangar, road or marker using the same rules as dragging. In the Hangar Editor they nudge stalls and markers.
- **No room inside:** if an inside parking area or counter has no free space, the form says so instead of dropping it onto a hangar.
- **Markers inside hangars:** they also show in the ground view's hangar preview and in its object list.

Use the header's **Road** and **Parking** buttons, or **Marker** for a ticket counter, gift counter or washroom, to add them. Turn on **Edit layout** to drag or resize them.

## Generating stalls: walls + islands, open sides

**Generate Stalls** offers two layouts. The planner in `src/domain/stallLayout.ts` is pure, and the form's live preview uses the same output as the generator, so the preview is exactly what gets created.

- **Along walls + islands** (default, from the planning sketch):
  - **Wall rows:** rows of stalls are attached to the chosen hangar walls, top, left and right by default. The bottom wall stays free for entry and exit.
  - **Centre islands:** optional back-to-back island blocks sit in the centre, centred on the grid.
  - **Aisles:** a set aisle width separates wall rows from islands and islands from each other. *Gap from walls* sets the distance from the walls; 0 means attached.
  - **Sizes:** *frontage* runs along the aisle and *depth* runs back toward the wall. Side columns and islands turn the stall to suit.
  - **Numbering:** clockwise. The top row goes left to right, the right wall top to bottom, the bottom wall right to left and the left wall bottom to top. Islands come last.
  - **Open sides:** every stall is left open on the side that faces an aisle. Island stalls open on their outer sides and, at the ends, their end side. A side only counts as open if a meaningful stretch of it faces open floor, so corner stalls boxed in by the next row stay walled.
- **Grid:** the original rows × columns layout. It gains a picker for which sides of every stall are open.

**Open sides.** `Stall.openSides?: ('top' | 'right' | 'bottom' | 'left')[]` marks a side as an opening, drawn dotted. Walls stay solid. For Corner stalls this applies to the outline edges on that side.

- **Where to change it:** click an edge of the stall diagram in the stall's details panel, the Edit Stall form, or the multi-selection panel, where it applies to every selected stall. Each change is one undo step.
- **Duplicate, split and merge:** duplicate copies open sides. Split walls the new shared edge and keeps the other openings. Merge combines the openings of both halves.

## Duplicating hangars

Select a hangar to see two buttons in the sidebar:

- **Duplicate** makes a same-size, empty hangar.
- **Duplicate + stalls**, or Ctrl/⌘+D, also copies the hangar's stalls and hangar-scoped markers.

The copy lands next to the source, trying right, below, left, then above. Failing those, it takes the first free spot on the ground.

- **Gap:** it keeps the same gap your hangars already use between each other, or 2 units if there's only one hangar, rounded up to the grid.
- **Tight layouts:** if nothing fits at that gap, it tries one grid step, then touching.
- **Markers:** it avoids any marker on the ground, including ones flush with the edge. It gets the next free letter, so "Hangar A"/"H-A" becomes "Hangar D"/"H-D". Copied stalls keep their geometry, type, prices and open sides. They are renumbered for the new hangar, so `A-01` becomes `D-01`. Numbers stay unique within the copy, and stalls are reset to *available* with no exhibitor. When no room is left, a message says so and nothing changes. Each duplicate is one undo step.

## Dimensions

The ruler toggle, or the **M** key, shows real side lengths. The preference is saved per viewer in `localStorage`.

- **Ground:** width and height dimension lines. They sit beyond any road or parking hugging that side.
- **Hangars:** width and height lines outside the bottom and right edges. They move inside the frame when a neighbouring hangar leaves no room.
- **Stalls (Hangar Editor):** the length of each full side is labelled inside the stall. For Corner stalls these are the two uncut sides.
- **Roads / parking:** length × width, or size and capacity, in their labels.
- **While resizing:** a live `W × H` readout follows the Transformer in both views.

Ground, hangar and road dimension lines, and the resize readout, stay a constant size on screen at any zoom. Stall side-length labels are drawn inside each stall and scale with it, like the stall number, so zoom in to read them on large hangars. All labels use the ground's unit (m or ft).

## Interaction model

| Where | Action | Result |
| --- | --- | --- |
| Ground | Click hangar / stall / marker | Select it and show details in the sidebar |
| Ground | Double-click hangar, or Enter on a selected hangar | Open the Hangar Editor |
| Ground | **Edit layout** toggle (E) | Hangars, ground markers, roads and parking become draggable and resizable |
| Both | **M** or the ruler button | Show / hide dimensions |
| Ground | Ctrl/⌘+D on a selected hangar | Duplicate it with its stalls |
| Ground | Drag background, scroll | Pan, zoom at the cursor |
| Editor | Click, Shift+click, drag on background | Select, toggle, marquee select (Shift adds) |
| Editor | Drag a selected stall | Moves the whole selection, snapped |
| Editor | Hold Space or use the hand tool, then drag | Pan |
| Both | Ctrl/⌘ Z, Shift+Z, Y, S, A, D · Delete · + / − · Esc · ? | Undo, redo, save, select all, duplicate, delete, zoom, deselect or close, help |

Shortcuts pause while a text field is focused or a dialog is open.

## Persistence and swapping the backend

`LayoutRepository` is the only storage boundary:

```ts
interface LayoutRepository {
  load(): Promise<{ data: StallLayoutData | null; source: 'current' | 'migrated' | 'default' | 'empty'; fromVersion: number | null }>;
  /** May return the canonical saved copy (real ids for anything sent as new) — the store adopts it when one comes back. */
  save(data: StallLayoutData): Promise<StallLayoutData | void>;
  reset(): Promise<void>;
  getDefaultLayout(): StallLayoutData;
}
```

`LocalStorageLayoutRepository` and `MemoryLayoutRepository` still exist (exercised directly by `src/test/*` and `src/repository/*.test.ts`) but are no longer the default entry point. `LocalStorageLayoutRepository` uses the Angular app's keys: `gs_stall_layout_v3`, with automatic migration from `gs_stall_layout_v2`.

**The default is now `ApiLayoutRepository`** (`src/repository/apiLayoutRepository.ts`), backed by the .NET `Modules.Layout` module (`GET/PUT/DELETE /api/layout/{exhibitionId}`). It's constructed per-exhibition — see `PlannerRoot.tsx` (`src/PlannerRoot.tsx`), which sits inside `AuthGate` in `main.tsx`: it calls `GET /api/layout/exhibitions` for the picker, then constructs `new ApiLayoutRepository(exhibitionId, authorizedFetch)` and mounts `<App key={exhibitionId}>` once one is chosen. `authorizedFetch` (from `useAuth()`, `src/auth/AuthContext.tsx`) attaches the bearer token and retries once on a 401.

Two things this repository has to do that the local ones don't:
- **Id round-trip.** The backend upserts by id and prunes anything missing from the payload; anything the client sent as new (id 0, or an id it never actually got back from a prior save) gets a real server-assigned id. `save()` returns that canonical copy, and `saveNow()` (`store/layoutStore.ts`) adopts it into `data` directly — not through `commit()` — since it's a save-driven correction, not a user edit.
- **RowVersion.** Tracked privately on the repository instance (never in domain data), sent back on every `save()` for optimistic concurrency; a mismatch means someone else saved this layout first.

`Stall.stallBookingId` (optional) exists purely to round-trip a stall's booking assignment through this save cycle unchanged — set only by the assign/unassign flow (not yet wired into the UI; the endpoints already exist server-side: `POST`/`DELETE /api/layout/{exhibitionId}/stalls/{stallId}/assign`).

e2e tests exercise this real code path too, not a bypass — `e2e/helpers.ts`'s `boot()` mocks `**/api/layout/*` with an in-memory, stateful fake (GET/PUT/DELETE all behave like the real API, including 404 for "no layout yet"), rather than seeding `localStorage` directly.

## Behaviour notes and deviations

- **Ported rules unchanged:** stall numbering, merge (two adjacent available stalls), split (halves with prices halved, suffixes `-A`/`-B`), duplicate naming, generate-stall skipping, bulk status clearing exhibitor names, hangar validation and colours.
- **Opening a hangar** is a double-click rather than a single click. A single click selects, which the Transformer needs for resizing.
- **Clear All** is undoable, and a cleared layout stays empty after reload. The Angular app re-seeded the demo data. A `gs_stall_layout_cleared` marker records the cleared state.
- **Booking transitions** now push undo snapshots. Block, Unblock and both cancellations use a confirm dialog. Reserve/Book's free-text exhibitor-name form is still there, but only as the fallback for a repository that isn't API-backed (LocalStorage/Memory — no real bookings to assign). With `ApiLayoutRepository`, an `available` stall's QuickActions shows a single **Assign** action instead: a dropdown of real, unassigned bookings for this exhibition (`GET .../assignable-bookings`), and picking one calls `POST .../stalls/{id}/assign` — the resulting reserved-vs-booked status comes from the booking's own approval state, not a choice the admin makes. Cancelling a stall that's actually linked to a booking calls `DELETE .../assign` (see `store/actions.ts`'s `unassignRealBooking`) so it's freed up for reassignment, not just cleared locally.
- **Duplicate** copies the whole multi-selection as a block. It uses the original placement rule: to the right of the selection, otherwise below it.
- **Ground markers** are auto-placed clear of hangars and their labels.
- **Safety markers** (CCTV, Fire Exit — `domain/site.ts`'s `SAFETY_MARKER_TYPES`) are placed the same way as any other marker (inside a hangar or at ground level), but can be hidden as a group: the "safety markers" toggle in the header (and in the hangar editor's own toolbar) is purely a display filter — `domain/site.ts`'s `visibleAnnotations()` — it never touches `data.annotations` itself, so placement rules, collision checks and fit-to-content bounds are unaffected by whether they're currently shown.
- **Undo history** lives in the store's `commit()` rather than a generic Zustand middleware. Only layout data is snapshotted, not UI state.
- **Wire compatibility of open sides:** `Stall.openSides` is a new, optional field. Stalls without it are fully walled, so old data is unchanged, but the .NET API must accept or at least round-trip the field.
- **Wire compatibility of site items:** the .NET API and the Angular app must accept the new `AnnotationType` values `'road'`, `'parking'`, `'gift-counter'` and `'washroom'`, as well as negative annotation coordinates. The Angular renderer has no colours for these types, so it would fail on them.
