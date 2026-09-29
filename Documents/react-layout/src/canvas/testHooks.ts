import type Konva from 'konva';
import { useLayoutStore } from '../store/layoutStore';

/**
 * Dev/test-only window hooks so Playwright can locate Konva nodes on screen
 * (canvas content isn't in the DOM). Stripped from production builds.
 */
declare global {
  interface Window {
    __layoutTest__?: {
      stages: Partial<Record<'ground' | 'editor', Konva.Stage>>;
      getState: typeof useLayoutStore.getState;
      /** Screen (client) coordinates of a node's centre / box. */
      nodeBox: (scope: 'ground' | 'editor', selector: string) => { x: number; y: number; width: number; height: number } | null;
    };
  }
}

export function exposeStageForTests(scope: 'ground' | 'editor', stage: Konva.Stage | null): () => void {
  if (import.meta.env.PROD || typeof window === 'undefined') return () => {};
  const t = (window.__layoutTest__ ??= {
    stages: {},
    getState: useLayoutStore.getState,
    nodeBox(sc, selector) {
      const st = this.stages[sc];
      // Konva selectors have no descendant combinator — resolve "a b" step by step.
      let node: Konva.Node | undefined = st;
      for (const part of selector.trim().split(/\s+/)) node = (node as Konva.Container | undefined)?.findOne(part);
      if (!st || !node) return null;
      const r = node.getClientRect({ skipShadow: true, skipStroke: true });
      const c = st.container().getBoundingClientRect();
      return { x: c.left + r.x, y: c.top + r.y, width: r.width, height: r.height };
    },
  });
  if (stage) t.stages[scope] = stage;
  return () => {
    if (t.stages[scope] === stage) delete t.stages[scope];
  };
}
