import { cx } from '../components/ui';
import type { RectSide } from '../domain/types';

export type SideState = 'open' | 'closed' | 'mixed';

const SIDE_LABEL: Record<RectSide, string> = { top: 'Top', right: 'Right', bottom: 'Bottom', left: 'Left' };

/** Per-side state for one or many stalls. */
export function sideStates(stalls: ReadonlyArray<{ openSides?: RectSide[] | undefined }>): Record<RectSide, SideState> {
  const out = {} as Record<RectSide, SideState>;
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const n = stalls.filter((s) => s.openSides?.includes(side)).length;
    out[side] = n === 0 ? 'closed' : n === stalls.length ? 'open' : 'mixed';
  }
  return out;
}

const EDGE_POS: Record<RectSide, string> = {
  top: 'left-3 right-3 top-0 h-3 items-start',
  bottom: 'left-3 right-3 bottom-0 h-3 items-end',
  left: 'top-3 bottom-3 left-0 w-3 justify-start',
  right: 'top-3 bottom-3 right-0 w-3 justify-end',
};

const LINE: Record<RectSide, string> = {
  top: 'h-0 w-full border-t-[3px]',
  bottom: 'h-0 w-full border-b-[3px]',
  left: 'w-0 h-full border-l-[3px]',
  right: 'w-0 h-full border-r-[3px]',
};

/**
 * A little stall diagram whose four edges are toggle buttons: click a side to
 * mark it as an opening (dotted) or wall it up again (solid).
 */
export function OpenSidesPicker({
  state,
  onToggle,
  caption = 'Click a side to mark it open (dotted) or walled (solid).',
  size = 'md',
}: {
  state: Record<RectSide, SideState>;
  onToggle: (side: RectSide) => void;
  caption?: string;
  size?: 'sm' | 'md';
}) {
  const open = (['top', 'right', 'bottom', 'left'] as const).filter((s) => state[s] === 'open');
  return (
    <div className="flex items-center gap-3" role="group" aria-label="Open sides">
      <div className={cx('relative shrink-0 rounded-sm bg-green-50', size === 'sm' ? 'h-14 w-20' : 'h-16 w-24')}>
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => {
          const st = state[side];
          return (
            <button
              key={side}
              type="button"
              aria-pressed={st === 'mixed' ? 'mixed' : st === 'open'}
              aria-label={`${SIDE_LABEL[side]} side: ${st === 'open' ? 'open' : st === 'mixed' ? 'mixed' : 'wall'}`}
              title={`${SIDE_LABEL[side]} side — ${st === 'open' ? 'open (click to wall)' : 'wall (click to open)'}`}
              onClick={() => onToggle(side)}
              className={cx(
                'group absolute flex rounded-sm focus-visible:outline-2 focus-visible:outline-blue-600',
                EDGE_POS[side],
              )}
            >
              <span
                className={cx(
                  LINE[side],
                  'transition-colors group-hover:border-blue-600',
                  st === 'closed' ? 'border-solid border-green-700' : 'border-dotted border-green-700',
                  st === 'mixed' && 'opacity-50',
                )}
              />
            </button>
          );
        })}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-medium text-green-800">
          {open.length ? `open: ${open.map((s) => s[0]!.toUpperCase()).join(' ')}` : 'walled'}
        </span>
      </div>
      <p className="text-xs text-slate-500">{caption}</p>
    </div>
  );
}
