import type { ZoomPanApi } from '../hooks/useZoomPan';

export type ViewportScope = 'ground' | 'editor';

export interface ViewportControls extends Pick<ZoomPanApi, 'zoomIn' | 'zoomOut'> {
  fitGround: () => void;
  fitContent: () => void;
}

/**
 * Lets non-canvas code (keyboard shortcuts, toolbars) drive whichever stage is
 * mounted without prop-drilling refs through the tree.
 */
const registry = new Map<ViewportScope, ViewportControls>();

export function registerViewport(scope: ViewportScope, controls: ViewportControls): () => void {
  registry.set(scope, controls);
  return () => {
    if (registry.get(scope) === controls) registry.delete(scope);
  };
}

export function getViewport(scope: ViewportScope): ViewportControls | undefined {
  return registry.get(scope);
}
