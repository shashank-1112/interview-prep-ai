import Konva from 'konva';
import type { Box } from 'konva/lib/shapes/Transformer';
import { clamp, snap } from '../domain/geometry';

// Global Konva tuning for large scenes.
Konva.pixelRatio = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);

const MAX_CACHE_EDGE = 4096;

/**
 * Cache a node's rendering as a bitmap sized for the current zoom so it stays
 * crisp. Falls back to live drawing when a sharp cache would be too large
 * (deep zoom) — live drawing of what's on screen is cheaper than a blurry
 * multi-megapixel bitmap.
 */
export function smartCache(node: Konva.Node | null | undefined, zoom: number): void {
  if (!node || !node.getStage()) return;
  node.clearCache();
  const children = (node as Konva.Container).getChildren?.();
  if (children && children.length === 0) return;
  const rect = node.getClientRect({ skipTransform: true });
  if (!(rect.width > 0 && rect.height > 0)) return;
  const wanted = Math.max(zoom, 0.1) * Konva.pixelRatio;
  const maxEdge = Math.max(rect.width, rect.height);
  const allowed = MAX_CACHE_EDGE / maxEdge;
  if (allowed < wanted * 0.75) return; // too big to cache sharply → draw live
  node.cache({ pixelRatio: Math.min(wanted, allowed), offset: 2 });
}

// ── Staggered caching for many-hangar grounds ────────────────────────────────
//
// A ground with dozens of hangars mounts all of them in the same React commit, and each one's
// smartCache does real rasterization work (proportional to its stall count, not its final
// pixel size — see smartCache's own doc comment). Calling it directly from every hangar's
// mount effect, as HangarEditorStage's single StaticStalls layer does, blocks the main thread
// for all of them before the browser can paint anything. See LAYOUT_PHASE1_DECISIONS.md item 6
// — queuing instead spreads that same work across idle slices, so the ground becomes visible
// and interactive almost immediately, with hangars caching in behind it one by one.
interface CacheJob {
  node: Konva.Node;
  zoom: number;
}
let cacheQueue: CacheJob[] = [];
let cacheQueueScheduled = false;

function runCacheQueue(deadline?: { timeRemaining(): number }): void {
  const hasTime = () => !deadline || deadline.timeRemaining() > 0;
  while (cacheQueue.length > 0 && hasTime()) {
    const job = cacheQueue.shift()!;
    smartCache(job.node, job.zoom);
    job.node.getLayer()?.batchDraw();
  }
  if (cacheQueue.length > 0) {
    scheduleCacheQueueRun();
  } else {
    cacheQueueScheduled = false;
  }
}

function scheduleCacheQueueRun(): void {
  if (cacheQueueScheduled) return;
  cacheQueueScheduled = true;
  const ric = (typeof window !== 'undefined' ? (window as unknown as { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void) => void }).requestIdleCallback : undefined);
  if (ric) ric(runCacheQueue);
  else setTimeout(() => runCacheQueue(), 0);
}

/**
 * Queues a smartCache call instead of running it synchronously — use this (instead of
 * smartCache directly) anywhere many instances can mount/update in the same commit, e.g. the
 * ground view's one-cache-per-hangar. A node already queued is re-queued at the end rather than
 * duplicated, so rapid updates (zoom settling) don't pile up redundant work.
 */
export function scheduleSmartCache(node: Konva.Node | null | undefined, zoom: number): void {
  if (!node) return;
  cacheQueue = cacheQueue.filter((j) => j.node !== node);
  cacheQueue.push({ node, zoom });
  scheduleCacheQueueRun();
}

/** Absolute (screen) box → world-space box, using the stage transform. */
function absToWorld(stage: Konva.Stage, b: Box): Box {
  const s = stage.scaleX();
  const p = stage.position();
  return { ...b, x: (b.x - p.x) / s, y: (b.y - p.y) / s, width: b.width / s, height: b.height / s };
}

function worldToAbs(stage: Konva.Stage, b: Box): Box {
  const s = stage.scaleX();
  const p = stage.position();
  return { ...b, x: b.x * s + p.x, y: b.y * s + p.y, width: b.width * s, height: b.height * s };
}

export interface BoundBoxOptions {
  /** Grid step in world px (0 disables snapping). */
  gridPx: number;
  minWidthPx: number;
  minHeightPx: number;
  /** Allowed area in world px. */
  bounds: { x: number; y: number; width: number; height: number };
  /** World-space offset of the node's parent (e.g. hangar origin). */
  origin?: { x: number; y: number };
  /** Extra veto on the snapped box (world px, parent-relative) — e.g. "roads may not overlap the ground". */
  reject?: (box: { x: number; y: number; width: number; height: number }) => boolean;
}

/**
 * Transformer `boundBoxFunc` that snaps every edge to the grid, keeps the box
 * inside `bounds`, and rejects boxes below the minimum size.
 */
export function makeBoundBoxFunc(getStage: () => Konva.Stage | null, getOpts: () => BoundBoxOptions) {
  return (oldBox: Box, newBox: Box): Box => {
    const stage = getStage();
    if (!stage) return newBox;
    const o = getOpts();
    const ox = o.origin?.x ?? 0;
    const oy = o.origin?.y ?? 0;
    const w = absToWorld(stage, newBox);
    const was = absToWorld(stage, oldBox);
    let left = w.x - ox;
    let top = w.y - oy;
    let right = left + w.width;
    let bottom = top + w.height;
    const oldLeft = was.x - ox;
    const oldTop = was.y - oy;
    const oldRight = oldLeft + was.width;
    const oldBottom = oldTop + was.height;
    // Only snap edges the user is actually dragging; an untouched edge keeps its
    // exact position (so off-grid, flush edges don't jump onto the grid).
    const moved = (a: number, b: number) => Math.abs(a - b) > 0.01;
    if (o.gridPx > 0) {
      left = moved(left, oldLeft) ? snap(left, o.gridPx) : oldLeft;
      top = moved(top, oldTop) ? snap(top, o.gridPx) : oldTop;
      right = moved(right, oldRight) ? snap(right, o.gridPx) : oldRight;
      bottom = moved(bottom, oldBottom) ? snap(bottom, o.gridPx) : oldBottom;
    }
    left = clamp(left, o.bounds.x, o.bounds.x + o.bounds.width);
    right = clamp(right, o.bounds.x, o.bounds.x + o.bounds.width);
    top = clamp(top, o.bounds.y, o.bounds.y + o.bounds.height);
    bottom = clamp(bottom, o.bounds.y, o.bounds.y + o.bounds.height);
    if (right - left < o.minWidthPx - 1e-6 || bottom - top < o.minHeightPx - 1e-6) return oldBox;
    if (o.reject?.({ x: left, y: top, width: right - left, height: bottom - top })) return oldBox;
    return worldToAbs(stage, { x: left + ox, y: top + oy, width: right - left, height: bottom - top, rotation: 0 });
  };
}

/** Screen-space distance moved since a pointer went down, to tell clicks from drags. */
export function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export const TRANSFORMER_STYLE = {
  rotateEnabled: false,
  flipEnabled: false,
  ignoreStroke: true,
  keepRatio: false,
  borderStroke: '#2563eb',
  borderStrokeWidth: 1,
  anchorStroke: '#2563eb',
  anchorFill: '#ffffff',
  anchorSize: 9,
  anchorCornerRadius: 2,
  enabledAnchors: ['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left'],
} as const;
