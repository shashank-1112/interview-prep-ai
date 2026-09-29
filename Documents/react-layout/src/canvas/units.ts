import { PX_PER_UNIT } from '../domain/constants';
import { clean } from '../domain/geometry';
import type { Rect } from '../domain/types';

/** Layout units (m / ft) → canvas world pixels at zoom 1. */
export const toPx = (u: number) => u * PX_PER_UNIT;
/** Canvas world pixels → layout units, with float noise removed. */
export const toUnits = (px: number) => clean(px / PX_PER_UNIT);

export const rectToPx = (r: Rect): Rect => ({ x: toPx(r.x), y: toPx(r.y), width: toPx(r.width), height: toPx(r.height) });
