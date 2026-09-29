import { Maximize, Minus, Plus, Scan } from 'lucide-react';

interface ZoomControlsProps {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitGround: () => void;
  onFitContent: () => void;
  groundLabel?: string;
}

export function ZoomControls({ scale, onZoomIn, onZoomOut, onFitGround, onFitContent, groundLabel = 'Fit to ground' }: ZoomControlsProps) {
  const btn =
    'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600';
  return (
    <div
      className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur"
      role="toolbar"
      aria-label="Zoom controls"
    >
      <button type="button" className={btn} onClick={onZoomOut} aria-label="Zoom out" title="Zoom out (-)">
        <Minus size={16} />
      </button>
      <span className="w-12 text-center text-xs tabular-nums text-slate-600" aria-live="polite" data-testid="zoom-level">
        {Math.round(scale * 100)}%
      </span>
      <button type="button" className={btn} onClick={onZoomIn} aria-label="Zoom in" title="Zoom in (+)">
        <Plus size={16} />
      </button>
      <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
      <button type="button" className={btn} onClick={onFitGround} aria-label={groundLabel} title={groundLabel}>
        <Maximize size={16} />
      </button>
      <button type="button" className={btn} onClick={onFitContent} aria-label="Fit to content" title="Fit to content">
        <Scan size={16} />
      </button>
    </div>
  );
}
