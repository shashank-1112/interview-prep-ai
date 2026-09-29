import Konva from 'konva';
import { forwardRef } from 'react';
import { Label, Tag, Text } from 'react-konva';
import { formatSize } from '../domain/site';
import type { LayoutUnit } from '../domain/types';
import { toUnits } from './units';

/** Hidden tooltip that follows the Transformer while resizing: "24 × 16 m". */
export const SizeReadout = forwardRef<Konva.Label>(function SizeReadout(_props, ref) {
  return (
    <Label ref={ref} visible={false} listening={false} name="size-readout">
      <Tag fill="#1e293b" cornerRadius={4} pointerDirection="down" pointerWidth={8} pointerHeight={5} />
      <Text text="" fontSize={12} fontStyle="600" fill="#ffffff" padding={5} fontFamily="Inter, ui-sans-serif, system-ui, sans-serif" />
    </Label>
  );
});

/**
 * Show the readout centred above `nodes`' combined box, measured in world
 * space so nodes in other layers (or nested groups) are positioned correctly.
 */
export function showSizeReadout(label: Konva.Label | null, nodes: Konva.Node[], unit: LayoutUnit): void {
  const layer = label?.getLayer();
  const stage = label?.getStage();
  if (!label || !layer || !stage || nodes.length === 0) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    // World space (stage-relative, i.e. without zoom/pan). The readout's own layer has no transform,
    // so this is valid whichever layer the measured nodes live in.
    const r = n.getClientRect({ relativeTo: stage, skipShadow: true, skipStroke: true });
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  const z = stage.scaleX() || 1;
  label.getText().text(formatSize(toUnits(maxX - minX), toUnits(maxY - minY), unit));
  label.scale({ x: 1 / z, y: 1 / z });
  label.position({ x: (minX + maxX) / 2, y: minY - 10 / z });
  label.visible(true);
  label.moveToTop();
  layer.batchDraw();
}

export function hideSizeReadout(label: Konva.Label | null): void {
  if (!label?.visible()) return;
  label.visible(false);
  label.getLayer()?.batchDraw();
}
