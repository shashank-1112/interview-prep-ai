import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AnnotationType, StallLayoutData } from '../domain/types';
import { EMPTY_FILTERS, type StallFilters } from '../domain/layoutOps';
import type { LayoutRepository } from '../repository/LayoutRepository';
import { emptyHistory, pushHistory, redoHistory, undoHistory, type History } from './history';

export type GroundSelection = { kind: 'hangar' | 'stall' | 'annotation'; id: number } | null;

export interface EditorState {
  hangarId: number | null;
  stallIds: ReadonlySet<number>;
  annotationId: number | null;
}

export type ModalState =
  | { kind: 'generateGround' }
  | { kind: 'addHangar' }
  | { kind: 'editHangar'; hangarId: number }
  | { kind: 'generateStalls'; hangarId: number | null }
  | { kind: 'addStall'; hangarId: number }
  | { kind: 'editStall'; stallId: number }
  | { kind: 'annotation'; hangarId: number | null; annotationId: number | null; presetType?: AnnotationType }
  | { kind: 'shortcuts' };

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
}

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface BulkState {
  filters: StallFilters;
  page: number;
  pageSize: number;
  selectedIds: ReadonlySet<number>;
}

export interface LayoutStoreState {
  repo: LayoutRepository | null;
  loadState: 'loading' | 'ready';
  data: StallLayoutData | null;
  history: History<StallLayoutData | null>;
  saveStatus: SaveStatus;
  saveError: string | null;

  editMode: boolean;
  /** Show side-length labels on the ground, hangars and stalls (per-viewer preference). */
  showDimensions: boolean;
  groundSelection: GroundSelection;
  editor: EditorState;
  modal: ModalState | null;
  confirm: ConfirmRequest | null;
  sidebarTab: 'details' | 'stalls';
  bulk: BulkState;
  /** Monotonic counter the canvases watch to trigger "fit to content". */
  fitRequest: { scope: 'ground' | 'editor'; mode: 'ground' | 'content'; n: number } | null;
}

export interface LayoutStoreActions {
  init(repo: LayoutRepository): Promise<void>;
  saveNow(): Promise<boolean>;
  /** Apply an immutable mutation and push an undo snapshot. No-op if recipe returns the same object. */
  commit(recipe: (data: StallLayoutData) => StallLayoutData): void;
  /** Replace the whole layout (generate ground / clear / load demo) as one undoable step. */
  replaceLayout(data: StallLayoutData | null): void;
  undo(): boolean;
  redo(): boolean;

  setEditMode(on: boolean): void;
  setShowDimensions(on: boolean): void;
  selectGround(sel: GroundSelection): void;
  openEditor(hangarId: number): void;
  closeEditor(): void;
  setEditorStalls(ids: Iterable<number>): void;
  toggleEditorStall(id: number): void;
  setEditorAnnotation(id: number | null): void;
  clearEditorSelection(): void;

  openModal(m: ModalState): void;
  closeModal(): void;
  requestConfirm(req: ConfirmRequest): void;
  resolveConfirm(accepted: boolean): void;

  setSidebarTab(tab: 'details' | 'stalls'): void;
  setFilters(patch: Partial<StallFilters>): void;
  resetFilters(): void;
  setPage(page: number): void;
  setPageSize(size: number): void;
  setBulkSelection(ids: Iterable<number>): void;

  requestFit(scope: 'ground' | 'editor', mode: 'ground' | 'content'): void;
}

export type LayoutStore = LayoutStoreState & LayoutStoreActions;

const EMPTY_SET: ReadonlySet<number> = new Set();

const PREFS_KEY = 'gs_stall_layout_prefs';

function readPrefs(): { showDimensions?: boolean } {
  try {
    const p: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    const show = p && typeof p === 'object' ? (p as { showDimensions?: unknown }).showDimensions : undefined;
    return typeof show === 'boolean' ? { showDimensions: show } : {};
  } catch {
    return {};
  }
}

function writePrefs(prefs: { showDimensions: boolean }): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — preference just won't persist */
  }
}

const initialEditor: EditorState = { hangarId: null, stallIds: EMPTY_SET, annotationId: null };

function initialState(): LayoutStoreState {
  return {
    repo: null,
    loadState: 'loading',
    data: null,
    history: emptyHistory(),
    saveStatus: 'idle',
    saveError: null,
    editMode: false,
    showDimensions: readPrefs().showDimensions ?? true,
    groundSelection: null,
    editor: initialEditor,
    modal: null,
    confirm: null,
    sidebarTab: 'details',
    bulk: { filters: EMPTY_FILTERS, page: 1, pageSize: 10, selectedIds: EMPTY_SET },
    fitRequest: null,
  };
}

/** Drop selections that point at entities no longer present (after delete/undo/redo). */
function pruneSelections(s: LayoutStoreState, data: StallLayoutData | null): Partial<LayoutStoreState> {
  if (!data) {
    return {
      groundSelection: null,
      editor: initialEditor,
      bulk: { ...s.bulk, selectedIds: EMPTY_SET },
    };
  }
  const stallIds = new Set(data.stalls.map((x) => x.id));
  const hangarIds = new Set(data.hangars.map((x) => x.id));
  const annotIds = new Set(data.annotations.map((x) => x.id));

  let groundSelection = s.groundSelection;
  if (groundSelection) {
    const exists =
      groundSelection.kind === 'hangar'
        ? hangarIds.has(groundSelection.id)
        : groundSelection.kind === 'stall'
          ? stallIds.has(groundSelection.id)
          : annotIds.has(groundSelection.id);
    if (!exists) groundSelection = null;
  }

  let editor = s.editor;
  if (editor.hangarId !== null && !hangarIds.has(editor.hangarId)) {
    editor = initialEditor;
  } else {
    const kept = [...editor.stallIds].filter((id) => stallIds.has(id));
    const annotationId = editor.annotationId !== null && annotIds.has(editor.annotationId) ? editor.annotationId : null;
    if (kept.length !== editor.stallIds.size || annotationId !== editor.annotationId) {
      editor = { ...editor, stallIds: new Set(kept), annotationId };
    }
  }

  const bulkKept = [...s.bulk.selectedIds].filter((id) => stallIds.has(id));
  const bulk = bulkKept.length === s.bulk.selectedIds.size ? s.bulk : { ...s.bulk, selectedIds: new Set(bulkKept) };

  let modal = s.modal;
  if (modal) {
    if ((modal.kind === 'editStall' && !stallIds.has(modal.stallId)) ||
        ((modal.kind === 'editHangar' || modal.kind === 'addStall') && !hangarIds.has(modal.hangarId))) {
      modal = null;
    }
  }

  return { groundSelection, editor, bulk, modal };
}

const AUTOSAVE_MS = 400;

export const useLayoutStore = create<LayoutStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState(),

    async init(repo) {
      set({ repo, loadState: 'loading' });
      const result = await repo.load();
      set({
        data: result.data,
        loadState: 'ready',
        history: emptyHistory(),
        saveStatus: result.source === 'migrated' ? 'saved' : 'idle',
        ...pruneSelections(get(), result.data),
      });
    },

    async saveNow() {
      const { repo, data } = get();
      if (!repo) return false;
      set({ saveStatus: 'saving' });
      try {
        if (data) await repo.save(data);
        else await repo.reset();
        // Only mark saved if nothing changed while the save was in flight.
        if (get().data === data) set({ saveStatus: 'saved', saveError: null });
        return true;
      } catch (err) {
        set({ saveStatus: 'error', saveError: (err as Error).message });
        return false;
      }
    },

    commit(recipe) {
      const s = get();
      if (!s.data) return;
      const next = recipe(s.data);
      if (next === s.data) return;
      set({
        data: next,
        history: pushHistory(s.history, s.data),
        saveStatus: 'dirty',
        ...pruneSelections(s, next),
      });
    },

    replaceLayout(data) {
      const s = get();
      set({
        data,
        history: pushHistory(s.history, s.data),
        saveStatus: 'dirty',
        groundSelection: null,
        editor: initialEditor,
        bulk: { ...s.bulk, page: 1, selectedIds: EMPTY_SET },
      });
    },

    undo() {
      const s = get();
      const r = undoHistory(s.history, s.data);
      if (!r) return false;
      set({ data: r.value, history: r.history, saveStatus: 'dirty', ...pruneSelections(s, r.value) });
      return true;
    },

    redo() {
      const s = get();
      const r = redoHistory(s.history, s.data);
      if (!r) return false;
      set({ data: r.value, history: r.history, saveStatus: 'dirty', ...pruneSelections(s, r.value) });
      return true;
    },

    setEditMode(on) {
      set({ editMode: on });
    },
    setShowDimensions(on) {
      set({ showDimensions: on });
      writePrefs({ showDimensions: on });
    },
    selectGround(sel) {
      set({ groundSelection: sel, sidebarTab: sel ? 'details' : get().sidebarTab });
    },
    openEditor(hangarId) {
      set({ editor: { hangarId, stallIds: EMPTY_SET, annotationId: null } });
    },
    closeEditor() {
      set({ editor: initialEditor });
    },
    setEditorStalls(ids) {
      set((s) => ({ editor: { ...s.editor, stallIds: new Set(ids), annotationId: null } }));
    },
    toggleEditorStall(id) {
      set((s) => {
        const next = new Set(s.editor.stallIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { editor: { ...s.editor, stallIds: next, annotationId: null } };
      });
    },
    setEditorAnnotation(id) {
      set((s) => ({ editor: { ...s.editor, annotationId: id, stallIds: id === null ? s.editor.stallIds : EMPTY_SET } }));
    },
    clearEditorSelection() {
      set((s) =>
        s.editor.stallIds.size === 0 && s.editor.annotationId === null
          ? s
          : { editor: { ...s.editor, stallIds: EMPTY_SET, annotationId: null } },
      );
    },

    openModal(modal) {
      set({ modal });
    },
    closeModal() {
      set({ modal: null });
    },
    requestConfirm(confirm) {
      set({ confirm });
    },
    resolveConfirm(accepted) {
      const req = get().confirm;
      set({ confirm: null });
      if (accepted) req?.onConfirm();
    },

    setSidebarTab(sidebarTab) {
      set({ sidebarTab });
    },
    setFilters(patch) {
      set((s) => ({ bulk: { ...s.bulk, filters: { ...s.bulk.filters, ...patch }, page: 1, selectedIds: EMPTY_SET } }));
    },
    resetFilters() {
      set((s) => ({ bulk: { ...s.bulk, filters: EMPTY_FILTERS, page: 1, selectedIds: EMPTY_SET } }));
    },
    setPage(page) {
      set((s) => ({ bulk: { ...s.bulk, page } }));
    },
    setPageSize(pageSize) {
      set((s) => ({ bulk: { ...s.bulk, pageSize, page: 1 } }));
    },
    setBulkSelection(ids) {
      set((s) => ({ bulk: { ...s.bulk, selectedIds: new Set(ids) } }));
    },

    requestFit(scope, mode) {
      set((s) => ({ fitRequest: { scope, mode, n: (s.fitRequest?.n ?? 0) + 1 } }));
    },
  })),
);

/** Debounced autosave: every committed change is persisted shortly after it lands. */
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
useLayoutStore.subscribe(
  (s) => s.data,
  (_data, _prev) => {
    const s = useLayoutStore.getState();
    if (s.loadState !== 'ready' || s.saveStatus !== 'dirty') return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => void useLayoutStore.getState().saveNow(), AUTOSAVE_MS);
  },
);

/** Reset to pristine state — tests only. */
export function resetLayoutStore(): void {
  clearTimeout(autosaveTimer);
  useLayoutStore.setState(initialState());
}

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectCanUndo = (s: LayoutStore) => s.history.past.length > 0;
export const selectCanRedo = (s: LayoutStore) => s.history.future.length > 0;
export const selectGround = (s: LayoutStore) => s.data?.ground ?? null;
export const selectEditorHangar = (s: LayoutStore) =>
  s.editor.hangarId === null ? null : (s.data?.hangars.find((h) => h.id === s.editor.hangarId) ?? null);
/** True whenever keyboard shortcuts should stand down (a modal or confirm dialog is up). */
export const selectIsBlockingOverlay = (s: LayoutStore) => s.modal !== null || s.confirm !== null;
