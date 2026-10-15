# Stall Layout Planner

An exhibition floor-plan editor built with React 18, TypeScript (strict), Konva and Zustand. It is a rebuild of the Angular `stall-layout-planner` component. It runs alongside the Angular admin app: it reuses that app's login session and saves layouts to the same .NET backend (the `Modules.Layout` module). The data model matches the Angular one field for field, so layouts stay wire-compatible.

## Contents

- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Sign-in and roles](#sign-in-and-roles)
- [Exhibitions](#exhibitions)
- [Project layout](#project-layout)
- [How it works](#how-it-works)
- [Editing the ground and hangars](#editing-the-ground-and-hangars)
- [Site: roads, parking and outside counters](#site-roads-parking-and-outside-counters)
- [Generating stalls](#generating-stalls)
- [Dimensions](#dimensions)
- [Interaction model](#interaction-model)
- [Persistence and the backend](#persistence-and-the-backend)
- [Testing](#testing)
- [Deployment](#deployment)
- [Behaviour notes and deviations](#behaviour-notes-and-deviations)

## Quick start

You need Node.js 22, the version CI uses.

```bash
npm install
cp .env.example .env.local    # optional: every value has a working fallback
npm run dev                   # http://localhost:5173
```

The app needs a signed-in session from the Angular admin app. Without one, it redirects to the Angular login page (see [Sign-in and roles](#sign-in-and-roles)). For local work, run the Angular app as well, sign in there, and open the planner from its menu.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Typecheck, then a production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm test` | Vitest unit and component tests (jsdom) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright tests. They start their own dev server on port 5199 and mock the backend. |

Before the first e2e run, install the browser once with `npx playwright install chromium`.

## Configuration

Settings come from `VITE_*` environment variables. Copy [.env.example](.env.example) to `.env.local`, which is gitignored. Every value has a fallback in [src/auth/config.ts](src/auth/config.ts), so you only need to set a variable when its fallback is wrong for your environment. Vite builds these values into the bundle, so a change needs a rebuild.

| Variable | Fallback | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://megatradefairapi.azurewebsites.net` | The .NET backend that both apps call |
| `VITE_ANGULAR_APP_URL` | `http://localhost:4300` | Where the Angular app is hosted. Used for the login and home redirects. |
| `VITE_ANGULAR_LOGIN_PATH` | `/login` | The Angular login route |
| `VITE_ANGULAR_PLANNER_PATH` | `/stall-layout-planner` | The Angular route that sends a signed-in user back here. Passed as `returnUrl` after login. |
| `VITE_AUTH_STORAGE_KEY` | `gs-exhibitor-auth-session` | `localStorage` key for the session. Must match the Angular `AuthSessionService` key exactly. |

## Sign-in and roles

This app has no login screen of its own. `AuthGate` ([src/auth/AuthContext.tsx](src/auth/AuthContext.tsx)) wraps the whole app:

- **Shared session:** it reads the tokens the Angular app stores under `VITE_AUTH_STORAGE_KEY`. It then decodes the JWT claims (name, email, roles, expiry), the same way the Angular app does.
- **No valid session:** it redirects to the Angular login with `returnUrl` set to the planner route.
- **Cross-origin handoff:** when the two apps run on different origins, the Angular app opens this one with `#at=<accessToken>&rt=<refreshToken>` in the URL fragment. [src/auth/handoff.ts](src/auth/handoff.ts) stores the tokens and strips the fragment straight away. A fragment is never sent to a server or written to server logs.
- **Token refresh:** the token is refreshed 60 seconds before it expires. `authorizedFetch` from `useAuth()` adds the bearer token and retries once with a fresh token on a 401.
- **Other tabs:** signing in or out in another tab, including in the Angular app, makes the session be checked again.

Role checks live in [src/auth/types.ts](src/auth/types.ts) and [src/auth/session.ts](src/auth/session.ts). They mirror the Angular `layoutPlannerRoles` and the .NET `LayoutController`, so keep all three in sync.

| Role | Access |
| --- | --- |
| `super_admin`, `admin`, `sales_head` | Full access: view, edit the ground, hangars, stalls and markers, and assign bookings |
| `sales_person` | View, and assign, reserve or book stalls. No geometry controls are shown. |
| Any other role | No access. Redirected back to the Angular app. |

The backend enforces these rules too and returns a 403 for a disallowed call. The UI hides the controls so a `sales_person` never sees a button that would fail.

## Exhibitions

Each layout belongs to one exhibition. [src/PlannerRoot.tsx](src/PlannerRoot.tsx) sits inside `AuthGate` and works like this:

1. It loads the exhibitions you can plan (`GET /api/layout/exhibitions`) and shows a picker.
2. It builds `new ApiLayoutRepository(exhibitionId, authorizedFetch)` for the chosen exhibition.
3. It mounts `<App key={exhibitionId}>`, so switching exhibitions starts with a fresh store.

`App` and the store never deal with exhibitions directly. They only see the repository they are given.

The chosen exhibition is kept in `sessionStorage`. Refreshing the tab keeps you on the same exhibition, and a new tab starts at the picker. An exhibition with no saved layout shows **No layout yet**. From there you can **Generate ground**, or **Load demo** (3 hangars, 42 stalls). The demo is only local until it is saved, and that first save creates the layout on the backend.

## Project layout

```
src/
  main.tsx       composition root: AuthGate → PlannerRoot
  PlannerRoot.tsx  exhibition picker; builds the per-exhibition ApiLayoutRepository and mounts App
  App.tsx        header toolbar, sidebar, ground stage, modal host
  auth/          AuthGate + useAuth, session decoding (jwt, session), cross-origin handoff, refresh/logout API, config
  domain/        types (wire model + form types), constants (stall presets, corner orientations, colours),
                 geometry (snap, overlap, corner polygon), layoutOps (generate/align/distribute/merge/split/filter/bulk,
                 ground resize, hangar spacing, duplicate), stallLayout (stall generator), site (roads, parking,
                 counters, boundary rules), booking (status transitions), schema (zod), seed (demo data)
  store/         layoutStore (Zustand: data, undo history, selection, modals, autosave), history,
                 actions (user commands: confirm → commit → toast)
  repository/    LayoutRepository interface, ApiLayoutRepository (default), LocalStorageLayoutRepository,
                 MemoryLayoutRepository (tests)
  canvas/        GroundStage, HangarEditor (lazy) + HangarEditorStage, StallShape, AnnotationShape, GridShape,
                 DimensionLine, SizeReadout, ZoomControls, Konva helpers, unit conversion
  forms/         GenerateGround, EditGround, SpaceHangars, GroundBoundary, Hangar, GenerateStalls (+ LayoutPreview),
                 StallEdit, Annotation: react-hook-form + zod, all lazy
  panels/        Details, StallDetails, QuickActions, BulkActions + Filter (lazy), OpenSidesPicker,
                 ConfirmDialog, ShortcutsHelp (lazy), SaveIndicator, CanvasA11y, ModalHost
  hooks/         useKeyboardShortcuts, shortcuts (help overlay source), useZoomPan, useUndoRedo, useElementSize
  components/    shared UI primitives (Button, Modal, Field, …)
  test/          Vitest setup and component tests
e2e/             Playwright specs: ground, editor, bulk, site, open-sides, rbac, review2, perf; helpers (boot + API mock)
```

## How it works

**Units.** All data is in layout units (metres or feet), exactly as stored. At 100 % zoom the canvas draws 20 px per unit (`PX_PER_UNIT`). Conversion happens only in [src/canvas/units.ts](src/canvas/units.ts). Stall `x`/`y` are relative to their hangar. Annotations scoped to a hangar are also hangar-relative. Ground annotations (`hangarId: null`) use ground coordinates.

**State and undo.** Layout data is immutable. `commit(recipe)` pushes the previous `StallLayoutData` object onto the undo stack. Each snapshot is therefore one reference, and hangars and stalls that didn't change are shared between snapshots.

- **What goes through `commit`:** every mutation, including move, resize, add, delete, generate, booking and bulk changes.
- **History:** capped at 50 steps.
- **Selections:** pruned after each commit, undo or redo, so they never point at deleted entities.
- **Saving:** changes autosave through the repository 400 ms after they land, and Ctrl/⌘+S saves immediately.

**Konva does the pointer work.**

- **Dragging:** hangars, stalls and annotations are draggable `Group`s. Snapping and clamping happen in `dragmove`.
- **Resizing:** each stage has one `Transformer`, bound to the current selection. Its `boundBoxFunc` snaps every edge to `ground.gridSize` and keeps the box inside its hangar or the ground. It also enforces a minimum of `gridSize × 2`, and for a hangar the minimum also covers the stalls inside it.
- **Committing:** nothing reaches Zustand while a pointer is down. Nodes move directly on the canvas, and the store updates once on `dragend` or `transformend`. A rejected change, such as dropping a hangar onto another hangar, snaps the node back.

**Performance with 500+ stalls.**

- **Ground view:** each hangar's stalls are one bitmap-cached group that ignores pointer events. Dragging a hangar moves one bitmap. A stall click is resolved by hit-testing rectangles in the hangar's own coordinates.
- **Hangar Editor:** unselected stalls live in one cached group on a static layer. Selected stalls render on a separate active layer with the Transformer and the marquee, so only that small layer redraws during a drag. Pressing an unselected stall selects it, moves it to the active layer, and continues the same press as a drag with `node.startDrag()`.
- **Sharp caches:** caches are redrawn once the zoom level settles (`smartCache`), so they stay sharp. Caching is skipped when a sharp bitmap would be too large.
- **Grid:** a single `Shape` whose `sceneFunc` draws every line in one path.
- **Perf test:** the perf spec loads 768 stalls and measures frame intervals while dragging in both views. It requires a median under 25 ms. Local runs measure about 16.7 ms, a steady 60 fps.

**Code splitting.** The initial bundle contains only the ground stage. The Hangar Editor, every form modal, the bulk panel and the shortcuts overlay are `React.lazy` chunks.

**Accessibility.** Konva nodes are not in the DOM, so each view also renders a list of buttons, one per hangar, stall and annotation, each with a descriptive label. The list stays visually hidden until it receives keyboard focus. A polite live region announces the current selection. Modals trap focus, close on Esc and return focus to where it was.

## Editing the ground and hangars

**Edit ground** (header) changes the ground's width, length and grid size without losing any hangars, stalls or markers.

- **Origin:** the top-left corner stays fixed, so only the right and bottom edges move.
- **Items that move:** ground-level items beyond those edges (roads, parking, outside counters) move with the edge and keep their distance. So do gates sitting on those edges.
- **Refused changes:** a size that would cut off a hangar, a marker inside the ground or a custom boundary. Also a grid coarser than the smallest stall or hangar allows, since the minimum size is two grid steps.

**Space hangars** (sidebar) sets one gap between hangars side by side and one gap between rows.

- **What stays put:** the first hangar in each row and the top row. The rest slide into place.
- **Contents:** stalls and markers inside a hangar move with it.
- **Refused spacing:** spacing that would push a hangar past the ground edge, onto another hangar, or onto parking or a counter. These are the same rules as moving a hangar by hand.

**Duplicating a hangar.** Select a hangar to see two buttons in the sidebar:

- **Duplicate** makes an empty hangar of the same size.
- **Duplicate + stalls**, or Ctrl/⌘+D, also copies the hangar's stalls and the markers scoped to it.

Where the copy goes:

- **Position:** next to the source, trying right, then below, left and above. If none of those fit, it takes the first free spot on the ground. It never lands on a marker, including one flush with the ground edge.
- **Gap:** the same gap your hangars already use, or 2 units if there's only one hangar, rounded up to the grid. If nothing fits at that gap, it tries one grid step, then touching.
- **No room:** a message says so and nothing changes.

What the copy contains:

- **Name:** the next free letter, so "Hangar A"/"H-A" becomes "Hangar D"/"H-D".
- **Stalls:** they keep their geometry, type, prices and open sides. They are renumbered for the new hangar, so `A-01` becomes `D-01`, and reset to *available* with no exhibitor.

Each duplicate is one undo step.

## Site: roads, parking and outside counters

The ground sits inside a **site surroundings** area, drawn as a dashed band around it. Ground-level annotations use ground coordinates, so anything outside the ground has negative `x`/`y`, or values beyond `ground.width`/`height`.

| Type | Where it may go | Notes |
| --- | --- | --- |
| Road | Always **outside** the ground, ground level only | Laid beside a chosen side, flush or with a gap. The length defaults to that side's length. A drop or resize that touches the ground is reverted. |
| Parking | **Inside or outside** the ground, never across its edge, ground level only | Painted bays and an estimated capacity of 25 m² per car, including aisles |
| Ticketing counter, gift counter, washroom | Inside or outside at ground level. Inside only when scoped to a hangar. | These three share one set of rules |
| Gates, open area, walking path | Inside the ground or a hangar | |
| CCTV, fire exit (safety markers) | Inside a hangar or at ground level, like other markers | The header toggle can hide them as a group |

The rules live in [src/domain/site.ts](src/domain/site.ts). Auto-placement, dragging, the Transformer and the forms all apply the same rules.

- **Placement:** `placeBesideGround` keeps an item within its side's span, so nothing slides round a corner onto another side. It slides the item along the side, then steps outward until it clears other roads, parking and counters.
- **Site margin:** `max(15, 30% of the longest ground side)`. It only limits dragging, and the site grows to include anything placed further out.
- **Hangars:** parking and counters inside the ground can't overlap a hangar, and a hangar can't be dropped onto them.
- **Flush items:** dragging snaps the offset from the edge, not the absolute position. Resizing only snaps the edges being dragged. A road flush against an edge stays flush, even with an off-grid width like 3.6 m.
- **Cancelling:** pressing Esc during a resize cancels it. Shortcuts pause while a drag or resize is in progress.
- **Keyboard:** in Edit layout mode, the arrow keys nudge the selected hangar, road or marker, using the same rules as dragging. In the Hangar Editor they nudge stalls and markers.
- **No room inside:** if inside parking or a counter has no free space, the form says so instead of dropping it onto a hangar.
- **Markers inside hangars:** they also show in the ground view's hangar preview and in its object list.
- **Safety markers:** the header toggle, also in the Hangar Editor toolbar, only filters what is drawn (`visibleAnnotations()`). It never changes `data.annotations`, so placement rules, collision checks and fit-to-content ignore whether the markers are shown.

To add these, use the header's **Road** and **Parking** buttons, or **Marker** for the other types. Turn on **Edit layout** to drag or resize them.

## Generating stalls

**Generate Stalls** offers two layouts. The planner in [src/domain/stallLayout.ts](src/domain/stallLayout.ts) is a pure function, and the form's live preview uses its output, so the preview is exactly what gets created.

**Along walls + islands** is the default, taken from the planning sketch:

- **Wall rows:** rows of stalls attach to the chosen hangar walls (top, left and right by default). The bottom wall stays free for entry and exit.
- **Centre islands:** optional back-to-back island blocks sit in the centre, aligned to the grid.
- **Aisles:** a set aisle width separates wall rows from islands, and islands from each other. *Gap from walls* sets the distance from the walls, and 0 means attached.
- **Sizes:** *frontage* runs along the aisle and *depth* runs back toward the wall. Side columns and islands turn the stall to match.
- **Numbering:** clockwise. The top row runs left to right, the right wall top to bottom, the bottom wall right to left and the left wall bottom to top. Islands come last.
- **Open sides:** every stall is open on the side that faces an aisle. Island stalls are open on their outer sides, and end stalls on their end side too. A side counts as open only if a meaningful stretch of it faces open floor, so corner stalls boxed in by the next row stay walled.

**Grid** is the original rows × columns layout. It adds a picker for which sides of every stall are open.

**Open sides.** `Stall.openSides?: ('top' | 'right' | 'bottom' | 'left')[]` marks a side as an opening, drawn dotted. Walls stay solid. For Corner stalls this applies to the outline edges on that side.

- **Where to change it:** click an edge of the stall diagram in the stall's details panel, in the Edit Stall form, or in the multi-selection panel, which applies the change to every selected stall. Each change is one undo step.
- **Duplicate, split and merge:** duplicating copies open sides. Splitting walls the new shared edge and keeps the other openings. Merging combines the openings of both halves.

## Dimensions

The ruler toggle, or the **M** key, shows real side lengths. The setting is saved per viewer in `localStorage`.

- **Ground:** width and height dimension lines, placed beyond any road or parking that hugs that side.
- **Hangars:** width and height lines outside the bottom and right edges. They move inside the frame when a neighbouring hangar leaves no room.
- **Stalls (Hangar Editor):** each full side's length is labelled inside the stall. For Corner stalls these are the two uncut sides.
- **Roads and parking:** their labels show length × width, or size and capacity.
- **While resizing:** a live `W × H` readout follows the Transformer in both views.

Ground, hangar and road dimension lines, and the resize readout, stay the same size on screen at any zoom. Stall side labels are drawn inside each stall and scale with it, like the stall number, so zoom in to read them on large hangars. All labels use the ground's unit (m or ft).

## Interaction model

| Where | Action | Result |
| --- | --- | --- |
| Ground | Click a hangar, stall or marker | Select it and show its details in the sidebar |
| Ground | Double-click a hangar, or Enter on a selected hangar | Open the Hangar Editor |
| Ground | **Edit layout** toggle (E) | Hangars, ground markers, roads and parking become draggable and resizable |
| Ground | Ctrl/⌘+D on a selected hangar | Duplicate it with its stalls |
| Ground | Arrow keys in Edit layout mode | Nudge the selected hangar or marker (Shift = ×5) |
| Ground | Drag the background, scroll | Pan, zoom at the cursor |
| Editor | Click, Shift+click, drag on the background | Select, toggle, marquee select (Shift adds) |
| Editor | Drag a selected stall | Moves the whole selection, snapped |
| Editor | Hold Space or use the hand tool, then drag | Pan |
| Editor | Arrow keys | Nudge selected stalls or a marker one grid step (Shift = ×5) |
| Both | **M** or the ruler button | Show or hide dimensions |
| Both | Ctrl/⌘ Z, Shift+Z, Y, S, A, D · Delete · + / − · Esc · ? | Undo, redo, save, select all, duplicate, delete, zoom, deselect or close, help |

Shortcuts pause while a text field has focus or a dialog is open. The **?** overlay is generated from `SHORTCUT_GROUPS` in [src/hooks/shortcuts.ts](src/hooks/shortcuts.ts), so update it there when you add a shortcut.

## Persistence and the backend

[`LayoutRepository`](src/repository/LayoutRepository.ts) is the only storage boundary. Components call store actions, and the actions call the repository.

```ts
interface LayoutRepository {
  load(): Promise<LayoutLoadResult>;
  /** May return the canonical saved copy (real ids for anything sent as new); the store adopts it. */
  save(data: StallLayoutData, events?: LayoutEvent[]): Promise<StallLayoutData | void>;
  reset(): Promise<void>;
  getDefaultLayout(): StallLayoutData;

  // Implemented only by ApiLayoutRepository; callers check for them and fall back otherwise.
  getAssignableBookings?(): Promise<AssignableBooking[]>;
  assignStall?(stallId: number, stallBookingId: number): Promise<Stall>;
  unassignStall?(stallId: number): Promise<Stall>;
  getConfig?(): Promise<LayoutConfigItem[]>;
}
```

**`ApiLayoutRepository`** ([src/repository/apiLayoutRepository.ts](src/repository/apiLayoutRepository.ts)) is the default, with one instance per exhibition. It uses these endpoints:

| Endpoint | Used for |
| --- | --- |
| `GET /api/layout/exhibitions` | The exhibition picker |
| `GET` / `PUT` / `DELETE /api/layout/{exhibitionId}` | Load, save, reset (a 404 means no layout yet) |
| `GET /api/layout/{exhibitionId}/assignable-bookings` | Bookings that can be assigned to a stall |
| `POST` / `DELETE /api/layout/{exhibitionId}/stalls/{stallId}/assign` | Assign or unassign a booking |
| `GET /api/layout/config` | Stall and hangar categories, statuses and colours. Global, not per exhibition. |
| `POST /api/identity/Auth/refresh-token`, `/logout` | Session refresh and sign-out |

It also does three jobs the local repositories don't need:

- **Id round-trip.** The backend upserts by id and removes anything missing from the payload. Anything sent as new (id 0, or an id the server never returned) gets a real server-assigned id. `save()` returns that canonical copy. `saveNow()` in [src/store/layoutStore.ts](src/store/layoutStore.ts) adopts it into `data` directly, not through `commit()`, because it is a correction from the save, not a user edit.
- **RowVersion.** Kept privately on the repository instance, never in domain data. It is sent back on every `save()` for optimistic concurrency, and a mismatch means someone else saved this layout first.
- **Wire mapping.** Roads, parking areas and ground assets are separate backend tables, each with its own id sequence. The domain model still keeps them in one `annotations` array. Each table's ids are offset on load so they can't collide in that array, and the offset is removed again on save. Wire types stay private to this file.

`Stall.stallBookingId` is optional. It exists only to carry a stall's booking assignment through the save cycle unchanged, and only the assign and unassign flow sets it.

**Local repositories.** `LocalStorageLayoutRepository` and `MemoryLayoutRepository` are still exercised by `src/test/*` and `src/repository/*.test.ts`, but the app no longer uses them by default. `LocalStorageLayoutRepository` uses the Angular app's keys: `gs_stall_layout_v3`, migrating automatically from `gs_stall_layout_v2`. Without `getConfig`, colours and status labels fall back to the defaults in [src/domain/constants.ts](src/domain/constants.ts).

## Testing

- **Unit and component tests** (Vitest, jsdom) sit next to the code as `*.test.ts(x)`, plus [src/test/](src/test/). Domain logic is pure functions, so most coverage lives in `src/domain/*.test.ts`.
- **End-to-end tests** (Playwright, Chromium only) are in [e2e/](e2e/). `boot()` in [e2e/helpers.ts](e2e/helpers.ts) does three things before the page loads:
  - It seeds a session with an unsigned JWT for the chosen role. The default role is `super_admin`, and `boot(page, { role: 'sales_person' })` tests role-gated UI.
  - It mocks every `/api/layout/*` endpoint with a stateful in-memory fake. GET, PUT and DELETE behave like the real API, including a 404 for "no layout yet".
  - It exercises the real `ApiLayoutRepository` code path rather than bypassing it.
- **Dev server and traces:** outside CI, Playwright reuses a dev server already running on port 5199. A trace is kept for each failed test in `test-results/`.

## Deployment

The UAT deployment runs from GitHub Actions. The workflow is `.github/workflows/uat_stalllayoutplanner.yml` on the `uat` branch.

1. A push to `uat`, or a manual run, triggers it.
2. On Node 22 it runs `npm install`, `npm run build` and `npm test`.
3. It deploys to the Azure Web App `stalllayoutplanner`.

The workflow sets no `VITE_*` variables, so the build uses the fallbacks in [src/auth/config.ts](src/auth/config.ts). The `VITE_ANGULAR_APP_URL` fallback is `http://localhost:4300`. For a hosted environment, set the variables in the build step so the login redirects point at the real Angular app.

## Behaviour notes and deviations

- **Ported rules unchanged:** stall numbering, merge (two adjacent available stalls), split (halves with prices halved and suffixes `-A`/`-B`), duplicate naming, skipping during stall generation, bulk status changes clearing exhibitor names, hangar validation and colours.
- **Opening a hangar** takes a double-click, not a single click. A single click selects, which the Transformer needs for resizing.
- **Clear All** is undoable, and a cleared layout stays empty after reload. The Angular app re-seeded the demo data instead. The local repository records the cleared state with a `gs_stall_layout_cleared` marker.
- **Booking:**
  - Booking transitions push undo snapshots. Block, Unblock and both cancellations ask for confirmation.
  - With `ApiLayoutRepository`, an available stall's quick actions show **Assign**. It opens a list of real, unassigned bookings for the exhibition. Whether the stall becomes reserved or booked depends on the booking's own approval state, not on a choice the admin makes.
  - Cancelling a stall linked to a booking calls `DELETE …/assign` (`unassignRealBooking` in [src/store/actions.ts](src/store/actions.ts)), so the booking can be assigned elsewhere.
  - The free-text Reserve/Book form is only a fallback for repositories without real bookings.
- **Duplicate** copies the whole multi-selection as a block. It keeps the original placement rule: to the right of the selection, otherwise below it.
- **Ground markers** are auto-placed clear of hangars and their labels.
- **Custom ground boundary:** a polygon boundary with a setback distance is built (`GroundBoundaryForm`, `activeBoundary` and `setbackViolation` in `domain/site.ts`), but its entry point is hidden. To bring it back, add a button that opens the `{ kind: 'groundBoundary' }` modal.
- **Undo history** lives in the store's `commit()`, not in a generic Zustand middleware. Only layout data is snapshotted, not UI state.
- **Wire compatibility:**
  - `Stall.openSides` is a new optional field. Stalls without it are fully walled, so old data is unchanged.
  - The `AnnotationType` values `'road'`, `'parking'`, `'gift-counter'` and `'washroom'` are new, and so are negative annotation coordinates.
  - The Angular renderer has no colours for these new annotation types, so it can't draw them.
