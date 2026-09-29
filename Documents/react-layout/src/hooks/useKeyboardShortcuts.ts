import Konva from 'konva';
import { useEffect } from 'react';
import { getViewport } from '../canvas/viewportRegistry';
import {
  deleteAnnotation,
  deleteHangar,
  deleteStalls,
  duplicateHangar,
  duplicateSelection,
  moveStallsBy,
  redo,
  saveLayout,
  setAnnotationRect,
  setHangarRect,
  undo,
} from '../store/actions';
import { clamp, clean } from '../domain/geometry';
import { useLayoutStore } from '../store/layoutStore';

function arrowDelta(e: KeyboardEvent, grid: number): [number, number] {
  const step = grid * (e.shiftKey ? 5 : 1);
  return [e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0];
}

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  if (t.tagName === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(type);
  }
  return false;
}

/**
 * Global shortcuts. They stand down while a text field has focus or a modal /
 * confirm dialog is open (those handle their own Esc/Tab).
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useLayoutStore.getState();
      if (s.modal || s.confirm) return;
      if (isTypingTarget(e.target)) return;
      if (e.defaultPrevented) return;
      // Never mutate the layout under an in-progress drag/resize (e.g. Ctrl+Z mid-gesture).
      // Esc still gets through: clearing the selection cancels a resize (the canvas reverts it).
      if ((Konva.isDragging() || Konva.isTransforming()) && e.key !== 'Escape') return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const inEditor = s.editor.hangarId !== null;

      // History & save work everywhere.
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        void saveLayout();
        return;
      }
      if (!s.data) return;

      if (e.key === '?' || (e.shiftKey && key === '/')) {
        e.preventDefault();
        s.openModal({ kind: 'shortcuts' });
        return;
      }
      if (!mod && !e.altKey && key === 'm') {
        e.preventDefault();
        s.setShowDimensions(!s.showDimensions);
        return;
      }
      if (!mod && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        getViewport(inEditor ? 'editor' : 'ground')?.zoomIn();
        return;
      }
      if (!mod && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        getViewport(inEditor ? 'editor' : 'ground')?.zoomOut();
        return;
      }

      if (inEditor) {
        const hangarId = s.editor.hangarId!;
        if (e.key === 'Escape') {
          e.preventDefault();
          if (s.editor.stallIds.size || s.editor.annotationId !== null) s.clearEditorSelection();
          else s.closeEditor();
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          if (s.editor.annotationId !== null) deleteAnnotation(s.editor.annotationId);
          else if (s.editor.stallIds.size) deleteStalls(s.editor.stallIds);
          return;
        }
        if (mod && key === 'a') {
          e.preventDefault();
          s.setEditorStalls(s.data.stalls.filter((x) => x.hangarId === hangarId).map((x) => x.id));
          return;
        }
        if (mod && key === 'd') {
          e.preventDefault();
          if (!e.repeat && !e.shiftKey && !e.altKey) duplicateSelection();
          return;
        }
        if (e.key.startsWith('Arrow') && !mod) {
          const [dx, dy] = arrowDelta(e, s.data.ground.gridSize);
          if (s.editor.stallIds.size) {
            e.preventDefault();
            moveStallsBy(s.editor.stallIds, dx, dy);
          } else if (s.editor.annotationId !== null) {
            const a = s.data.annotations.find((x) => x.id === s.editor.annotationId);
            const h = s.data.hangars.find((x) => x.id === hangarId);
            if (a && h) {
              e.preventDefault();
              setAnnotationRect(a.id, {
                ...a,
                x: clean(clamp(a.x + dx, 0, h.width - a.width)),
                y: clean(clamp(a.y + dy, 0, h.height - a.height)),
              });
            }
          }
          return;
        }
        return;
      }

      // Ground view
      const sel = s.groundSelection;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (sel) s.selectGround(null);
        else if (s.editMode) s.setEditMode(false);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault();
        if (sel.kind === 'hangar') deleteHangar(sel.id);
        else if (sel.kind === 'stall') deleteStalls([sel.id]);
        else deleteAnnotation(sel.id);
        return;
      }
      if (e.key === 'Enter' && sel?.kind === 'hangar' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        s.openEditor(sel.id);
        return;
      }
      if (!mod && key === 'e') {
        e.preventDefault();
        s.setEditMode(!s.editMode);
        return;
      }
      if (mod && key === 'a') {
        // No multi-select at ground level — keep the browser from selecting page text.
        e.preventDefault();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        if (sel?.kind === 'hangar' && !e.repeat && !e.shiftKey && !e.altKey) duplicateHangar(sel.id, true);
        return;
      }
      // Edit layout: arrows nudge the selected hangar / marker (same rules as dragging).
      if (e.key.startsWith('Arrow') && !mod && s.editMode && sel && sel.kind !== 'stall') {
        e.preventDefault();
        const [dx, dy] = arrowDelta(e, s.data.ground.gridSize);
        if (sel.kind === 'hangar') {
          const h = s.data.hangars.find((x) => x.id === sel.id);
          if (h) {
            setHangarRect(h.id, {
              ...h,
              x: clean(clamp(h.x + dx, 0, s.data.ground.width - h.width)),
              y: clean(clamp(h.y + dy, 0, s.data.ground.height - h.height)),
            });
          }
        } else {
          const a = s.data.annotations.find((x) => x.id === sel.id);
          if (a) setAnnotationRect(a.id, { ...a, x: clean(a.x + dx), y: clean(a.y + dy) });
        }
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
