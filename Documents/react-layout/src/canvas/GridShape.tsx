import { memo } from 'react';
import { Shape } from 'react-konva';

interface GridShapeProps {
  width: number;
  height: number;
  /** Minor grid step in world px. */
  step: number;
  /** Draw a darker line every `majorEvery` steps. */
  majorEvery?: number;
  /** Current zoom; minor lines are skipped when they'd be closer than ~6 screen px. */
  zoom: number;
  emphasis?: boolean;
}

/**
 * The whole grid is one Konva shape drawn with a single path per weight —
 * hundreds of lines cost one draw call and zero scene-graph nodes.
 */
export const GridShape = memo(function GridShape({ width, height, step, majorEvery = 10, zoom, emphasis }: GridShapeProps) {
  const showMinor = step * zoom >= 6;
  const majorStep = step * majorEvery;
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx, shape) => {
        const scale = shape.getAbsoluteScale().x || 1;
        const hair = 1 / scale;
        const drawLines = (s: number, color: string) => {
          if (s <= 0) return;
          ctx.beginPath();
          for (let x = s; x < width - 1e-6; x += s) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
          }
          for (let y = s; y < height - 1e-6; y += s) {
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
          }
          ctx.strokeStyle = color;
          ctx.lineWidth = hair;
          ctx.stroke();
        };
        if (showMinor) drawLines(step, emphasis ? '#e2e8f0' : '#f1f5f9');
        if (majorStep * zoom >= 4) drawLines(majorStep, emphasis ? '#cbd5e1' : '#e2e8f0');
      }}
    />
  );
});
