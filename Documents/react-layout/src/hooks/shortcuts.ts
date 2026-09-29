export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
export const MOD = IS_MAC ? '⌘' : 'Ctrl';

export interface ShortcutGroup {
  title: string;
  items: Array<{ keys: string[]; desc: string }>;
}

/** Single source of truth for the help overlay. Handlers live in useKeyboardShortcuts. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'General',
    items: [
      { keys: [MOD, 'Z'], desc: 'Undo last change' },
      { keys: [MOD, 'Shift', 'Z'], desc: 'Redo' },
      { keys: [MOD, 'Y'], desc: 'Redo' },
      { keys: [MOD, 'S'], desc: 'Save layout' },
      { keys: ['Esc'], desc: 'Deselect / close panel / close editor' },
      { keys: ['Delete'], desc: 'Delete the selection (also Backspace)' },
      { keys: ['+', '−'], desc: 'Zoom in / out' },
      { keys: ['M'], desc: 'Show / hide dimensions (side lengths)' },
      { keys: ['?'], desc: 'Show this help' },
    ],
  },
  {
    title: 'Ground view',
    items: [
      { keys: ['Click'], desc: 'Select a hangar, stall or marker' },
      { keys: ['Double-click'], desc: 'Open the Hangar Editor (also Enter on a selected hangar)' },
      { keys: ['E'], desc: 'Toggle Edit Layout mode (drag / resize hangars, roads, parking)' },
      { keys: [MOD, 'D'], desc: 'Duplicate the selected hangar with its stalls' },
      { keys: ['Arrows'], desc: 'Edit layout: nudge the selected hangar / marker (Shift = ×5)' },
      { keys: ['Drag background'], desc: 'Pan' },
      { keys: ['Scroll'], desc: 'Zoom around the cursor' },
    ],
  },
  {
    title: 'Hangar Editor',
    items: [
      { keys: [MOD, 'A'], desc: 'Select all stalls' },
      { keys: [MOD, 'D'], desc: 'Duplicate the selection' },
      { keys: ['Shift', 'Click'], desc: 'Add / remove a stall from the selection' },
      { keys: ['Drag background'], desc: 'Marquee select (hold Shift to add)' },
      { keys: ['Space', 'Drag'], desc: 'Pan' },
      { keys: ['Arrows'], desc: 'Nudge selected stalls / marker one grid step (Shift = ×5)' },
    ],
  },
];
