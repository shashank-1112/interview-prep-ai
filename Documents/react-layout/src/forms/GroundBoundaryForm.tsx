import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Field, Input, Modal } from '../components/ui';
import { isSelfIntersectingPolygon } from '../domain/geometry';
import type { Point } from '../domain/types';
import { setGroundBoundary } from '../store/actions';
import { useLayoutStore } from '../store/layoutStore';

/**
 * Entered as a coordinate list (add/remove rows) rather than drawn freehand on the ground
 * canvas — precise for the real use case (coordinates usually come from a site survey or
 * architectural drawing anyway) and much lower-risk than adding a new click-to-place
 * interaction mode to the already-complex GroundStage pan/zoom/select/drag canvas. See
 * LAYOUT_PHASE1_DECISIONS.md item 2.
 */
export default function GroundBoundaryForm({ onClose }: { onClose: () => void }) {
  const ground = useLayoutStore((s) => s.data!.ground);
  const [points, setPoints] = useState<Point[]>(() => ground.boundary ?? []);
  const [setback, setSetback] = useState<number>(ground.setbackDistance ?? 0);
  const [error, setError] = useState<string | null>(null);

  const selfIntersecting = points.length >= 3 && isSelfIntersectingPolygon(points);
  const tooFew = points.length > 0 && points.length < 3;

  const pad = Math.max(ground.width, ground.height) * 0.08;
  const previewPoints = useMemo(() => points.map((p) => `${p.x},${p.y}`).join(' '), [points]);

  const updatePoint = (i: number, patch: Partial<Point>) => {
    setPoints((cur) => cur.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const addPoint = () => {
    const last = points.at(-1);
    setPoints((cur) => [...cur, last ? { x: last.x, y: last.y } : { x: 0, y: 0 }]);
  };

  const removePoint = (i: number) => setPoints((cur) => cur.filter((_, idx) => idx !== i));

  const onApply = () => {
    const err = setGroundBoundary(points.length >= 3 ? points : null, setback);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  };

  const onClear = () => {
    setGroundBoundary(null, setback);
    onClose();
  };

  return (
    <Modal
      title="Ground Boundary &amp; Setback"
      description="Define a custom polygon boundary instead of the plain rectangle, and a setback distance hangars should stay clear of (a warning only, never a hard block)."
      onClose={onClose}
      size="lg"
      footer={
        <>
          {ground.boundary && (
            <Button variant="danger" onClick={onClear}>
              Clear boundary
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onApply} disabled={tooFew || selfIntersecting}>
            Apply
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Boundary points</span>
            <Button size="sm" icon={<Plus size={14} />} onClick={addPoint}>
              Add point
            </Button>
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {points.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No custom boundary — using the plain rectangle.</p>}
            {points.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-4 shrink-0 text-xs text-slate-400">{i + 1}</span>
                <Input
                  type="number"
                  aria-label={`Point ${i + 1} X`}
                  value={p.x}
                  onChange={(e) => updatePoint(i, { x: Number(e.target.value) })}
                  className="w-full"
                />
                <Input
                  type="number"
                  aria-label={`Point ${i + 1} Y`}
                  value={p.y}
                  onChange={(e) => updatePoint(i, { y: Number(e.target.value) })}
                  className="w-full"
                />
                <Button size="sm" icon={<Trash2 size={14} />} aria-label={`Remove point ${i + 1}`} onClick={() => removePoint(i)} />
              </div>
            ))}
          </div>
          {tooFew && <p className="mt-2 text-sm text-red-600">A custom boundary needs at least 3 points.</p>}
          {selfIntersecting && <p className="mt-2 text-sm text-red-600">This boundary is self-intersecting — its edges cross each other.</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <Field label="Setback distance" hint={`In ${ground.unit}. Hangars inside this margin get a warning, never blocked.`} className="mt-4">
            {(id) => <Input id={id} type="number" min={0} value={setback} onChange={(e) => setSetback(Math.max(0, Number(e.target.value)))} />}
          </Field>
        </div>
        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">Preview</span>
          <svg
            viewBox={`${-pad} ${-pad} ${ground.width + pad * 2} ${ground.height + pad * 2}`}
            className="h-72 w-full rounded-md border border-slate-200 bg-slate-50"
            role="img"
            aria-label="Ground boundary preview"
            data-testid="boundary-preview"
          >
            <rect x={0} y={0} width={ground.width} height={ground.height} fill="none" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            {points.length >= 3 && (
              <polygon
                points={previewPoints}
                fill={selfIntersecting ? '#fee2e2' : '#dcfce7'}
                fillOpacity={0.5}
                stroke={selfIntersecting ? '#dc2626' : '#16a34a'}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={Math.max(ground.width, ground.height) * 0.012} fill="#1d4ed8" />
            ))}
          </svg>
        </div>
      </div>
    </Modal>
  );
}
