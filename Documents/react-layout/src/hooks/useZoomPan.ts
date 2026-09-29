import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Rect } from '../domain/types';

export interface ZoomPanOptions {
  minScale?: number;
  maxScale?: number;
  /** Called (debounced) once zooming settles — used to re-cache layers at the new resolution. */
  onZoomSettled?: (scale: number) => void;
}

export interface ZoomPanApi {
  scale: number;
  onWheel: (e: KonvaEventObject<WheelEvent>) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Fit a world-space rect (px) into the viewport. */
  fitRect: (rect: Rect, padding?: number) => void;
}

const STEP = 1.2;

/**
 * Zoom & pan applied imperatively to the Konva stage — no React re-render of
 * the scene per wheel tick. Only the `scale` number (for the zoom readout)
 * goes through React state.
 */
export function useZoomPan(stageRef: RefObject<Konva.Stage | null>, opts: ZoomPanOptions = {}): ZoomPanApi {
  const { minScale = 0.05, maxScale = 40 } = opts;
  const [scale, setScaleState] = useState(1);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settledCb = useRef(opts.onZoomSettled);
  settledCb.current = opts.onZoomSettled;

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const applyScale = useCallback(
    (next: number, center?: { x: number; y: number }) => {
      const stage = stageRef.current;
      if (!stage) return;
      const old = stage.scaleX();
      const s = Math.min(maxScale, Math.max(minScale, next));
      const c = center ?? { x: stage.width() / 2, y: stage.height() / 2 };
      const world = { x: (c.x - stage.x()) / old, y: (c.y - stage.y()) / old };
      stage.scale({ x: s, y: s });
      stage.position({ x: c.x - world.x * s, y: c.y - world.y * s });
      stage.batchDraw();
      setScaleState(s);
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => settledCb.current?.(s), 160);
    },
    [stageRef, minScale, maxScale],
  );

  const onWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition() ?? undefined;
      // Trackpad pinch arrives as ctrl+wheel with small deltas — use a smooth factor.
      const factor = e.evt.ctrlKey ? Math.exp(-e.evt.deltaY * 0.01) : e.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
      applyScale(stage.scaleX() * factor, pointer);
    },
    [stageRef, applyScale],
  );

  const zoomIn = useCallback(() => applyScale((stageRef.current?.scaleX() ?? 1) * STEP), [applyScale, stageRef]);
  const zoomOut = useCallback(() => applyScale((stageRef.current?.scaleX() ?? 1) / STEP), [applyScale, stageRef]);

  const fitRect = useCallback(
    (rect: Rect, padding = 32) => {
      const stage = stageRef.current;
      if (!stage || rect.width <= 0 || rect.height <= 0 || stage.width() <= 0) return;
      const s = Math.min(
        maxScale,
        Math.max(minScale, Math.min((stage.width() - padding * 2) / rect.width, (stage.height() - padding * 2) / rect.height)),
      );
      stage.scale({ x: s, y: s });
      stage.position({
        x: (stage.width() - rect.width * s) / 2 - rect.x * s,
        y: (stage.height() - rect.height * s) / 2 - rect.y * s,
      });
      stage.batchDraw();
      setScaleState(s);
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => settledCb.current?.(s), 0);
    },
    [stageRef, minScale, maxScale],
  );

  return { scale, onWheel, zoomIn, zoomOut, fitRect };
}
