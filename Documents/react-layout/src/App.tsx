import {
  Building2,
  Car,
  Ruler,
  Route,
  Keyboard,
  LayoutGrid,
  MapPin,
  Move,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
  Undo2,
  Warehouse,
} from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { Toaster } from 'sonner';
import { GroundStage } from './canvas/GroundStage';
import { Button, cx, IconButton, ToolbarDivider } from './components/ui';
import { MOD } from './hooks/shortcuts';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useUndoRedo } from './hooks/useUndoRedo';
import { GroundA11yList, SelectionAnnouncer } from './panels/CanvasA11y';
import { ConfirmDialog } from './panels/ConfirmDialog';
import { DetailsPanel } from './panels/DetailsPanel';
import { ModalHost } from './panels/ModalHost';
import { SaveIndicator } from './panels/SaveIndicator';
import type { LayoutRepository } from './repository/LayoutRepository';
import { clearAll, loadDemoLayout, saveLayout } from './store/actions';
import { useLayoutStore } from './store/layoutStore';

// Code-split: only the ground stage ships in the initial bundle.
const HangarEditor = lazy(() => import('./canvas/HangarEditor'));
const BulkActionsPanel = lazy(() => import('./panels/BulkActionsPanel'));

function Header() {
  const data = useLayoutStore((s) => s.data);
  const canManage = useLayoutStore((s) => s.canManageLayout);
  const editMode = useLayoutStore((s) => s.editMode);
  const setEditMode = useLayoutStore((s) => s.setEditMode);
  const showDimensions = useLayoutStore((s) => s.showDimensions);
  const setShowDimensions = useLayoutStore((s) => s.setShowDimensions);
  const showSafetyMarkers = useLayoutStore((s) => s.showSafetyMarkers);
  const setShowSafetyMarkers = useLayoutStore((s) => s.setShowSafetyMarkers);
  const openModal = useLayoutStore((s) => s.openModal);
  const selectedHangarId = useLayoutStore((s) => (s.groundSelection?.kind === 'hangar' ? s.groundSelection.id : null));
  const { canUndo, canRedo, undo, redo } = useUndoRedo();

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white" aria-hidden>
          <Warehouse size={17} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-slate-900">{data?.ground.exhibitionName || 'Stall Layout Planner'}</h1>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {data && <span className="truncate">{data.ground.venueName}</span>}
            <SaveIndicator />
          </div>
        </div>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-1" role="toolbar" aria-label="Layout tools">
        {canManage && (
          <Button size="sm" icon={<Sparkles size={14} />} onClick={() => openModal({ kind: 'generateGround' })}>
            Generate ground
          </Button>
        )}
        {data && canManage && (
          <>
            {/* "Boundary" entry point hidden for now (feature stays built — store/actions/
                backend untouched, see GroundBoundaryForm.tsx and LAYOUT_PHASE1_DECISIONS.md
                item 2) — re-add a button opening { kind: 'groundBoundary' } to bring it back. */}
            <Button size="sm" icon={<Plus size={14} />} onClick={() => openModal({ kind: 'addHangar' })}>
              Hangar
            </Button>
            <Button size="sm" icon={<LayoutGrid size={14} />} onClick={() => openModal({ kind: 'generateStalls', hangarId: selectedHangarId })} disabled={data.hangars.length === 0}>
              Stalls
            </Button>
            <Button size="sm" icon={<MapPin size={14} />} onClick={() => openModal({ kind: 'annotation', hangarId: null, annotationId: null })}>
              Marker
            </Button>
            <Button size="sm" icon={<Route size={14} />} onClick={() => openModal({ kind: 'annotation', hangarId: null, annotationId: null, presetType: 'road' })}>
              Road
            </Button>
            <Button size="sm" icon={<Car size={14} />} onClick={() => openModal({ kind: 'annotation', hangarId: null, annotationId: null, presetType: 'parking' })}>
              Parking
            </Button>
            <ToolbarDivider />
            <Button
              size="sm"
              variant={editMode ? 'primary' : 'secondary'}
              icon={<Move size={14} />}
              onClick={() => setEditMode(!editMode)}
              aria-pressed={editMode}
              title="Toggle Edit Layout (E)"
            >
              {editMode ? 'Editing layout' : 'Edit layout'}
            </Button>
          </>
        )}
        <ToolbarDivider />
        {data && (
          <IconButton label="Show dimensions" shortcut="M" active={showDimensions} onClick={() => setShowDimensions(!showDimensions)}>
            <Ruler size={17} />
          </IconButton>
        )}
        {data && (
          <IconButton
            label={showSafetyMarkers ? 'Hide safety markers (CCTV, Fire Exit)' : 'Show safety markers (CCTV, Fire Exit)'}
            active={showSafetyMarkers}
            onClick={() => setShowSafetyMarkers(!showSafetyMarkers)}
          >
            <ShieldAlert size={17} />
          </IconButton>
        )}
        {canManage && (
          <>
            <IconButton label="Undo" shortcut={`${MOD}+Z`} disabled={!canUndo} onClick={undo}>
              <Undo2 size={17} />
            </IconButton>
            <IconButton label="Redo" shortcut={`${MOD}+Shift+Z`} disabled={!canRedo} onClick={redo}>
              <Redo2 size={17} />
            </IconButton>
            <IconButton label="Save" shortcut={`${MOD}+S`} onClick={() => void saveLayout()}>
              <Save size={17} />
            </IconButton>
          </>
        )}
        <IconButton label="Keyboard shortcuts" shortcut="?" onClick={() => openModal({ kind: 'shortcuts' })}>
          <Keyboard size={17} />
        </IconButton>
        {canManage && (
          <>
            <ToolbarDivider />
            <IconButton label="Load demo layout" onClick={loadDemoLayout}>
              <RotateCcw size={17} />
            </IconButton>
            {data && (
              <IconButton label="Clear all" onClick={clearAll} className="hover:bg-red-50 hover:text-red-600">
                <Trash2 size={17} />
              </IconButton>
            )}
          </>
        )}
      </div>
    </header>
  );
}

function EmptyState() {
  const openModal = useLayoutStore((s) => s.openModal);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-600" aria-hidden>
          <Building2 size={22} />
        </span>
        <h2 className="text-base font-semibold text-slate-900">No layout yet</h2>
        <p className="mt-1 text-sm text-slate-500">Generate an exhibition ground with hangars, or start from the demo layout.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => openModal({ kind: 'generateGround' })}>
            Generate ground
          </Button>
          <Button onClick={loadDemoLayout}>Load demo</Button>
        </div>
      </div>
    </div>
  );
}

function Sidebar() {
  const data = useLayoutStore((s) => s.data)!;
  const tab = useLayoutStore((s) => s.sidebarTab);
  const setTab = useLayoutStore((s) => s.setSidebarTab);
  const tabs = [
    { id: 'details', label: 'Details' },
    { id: 'stalls', label: `Stalls (${data.stalls.length})` },
  ] as const;
  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white" aria-label="Sidebar">
      <div role="tablist" aria-label="Sidebar views" className="flex border-b border-slate-200 px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cx(
              '-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-600',
              tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'details' ? (
          <DetailsPanel data={data} />
        ) : (
          <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
            <BulkActionsPanel data={data} />
          </Suspense>
        )}
      </div>
    </aside>
  );
}

export default function App({ repository }: { repository: LayoutRepository }) {
  const loadState = useLayoutStore((s) => s.loadState);
  const data = useLayoutStore((s) => s.data);
  const editorHangarId = useLayoutStore((s) => s.editor.hangarId);
  const editMode = useLayoutStore((s) => s.editMode);
  useKeyboardShortcuts();

  useEffect(() => {
    void useLayoutStore.getState().init(repository);
  }, [repository]);

  // Warn before leaving with an unsaved change still pending.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const st = useLayoutStore.getState().saveStatus;
      if (st === 'dirty' || st === 'saving' || st === 'error') e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1" aria-label="Exhibition ground">
          {loadState === 'loading' ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500" role="status">
              Loading layout…
            </div>
          ) : data ? (
            <>
              <GroundA11yList data={data} />
              <GroundStage data={data} />
              {editMode && (
                <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow">
                  Edit Layout — drag to move, handles to resize · Esc to exit
                </div>
              )}
            </>
          ) : (
            <EmptyState />
          )}
        </main>
        {data && <Sidebar />}
      </div>
      {data && <SelectionAnnouncer data={data} />}
      {data && editorHangarId !== null && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/70 text-sm text-slate-600" role="status">
              Opening hangar editor…
            </div>
          }
        >
          <HangarEditor key={editorHangarId} hangarId={editorHangarId} />
        </Suspense>
      )}
      <ModalHost />
      <ConfirmDialog />
      <Toaster position="bottom-left" richColors closeButton toastOptions={{ duration: 3500 }} />
    </div>
  );
}
