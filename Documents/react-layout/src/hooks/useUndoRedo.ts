import { redo, undo } from '../store/actions';
import { selectCanRedo, selectCanUndo, useLayoutStore } from '../store/layoutStore';

export function useUndoRedo() {
  const canUndo = useLayoutStore(selectCanUndo);
  const canRedo = useLayoutStore(selectCanRedo);
  return { canUndo, canRedo, undo, redo };
}
