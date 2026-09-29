import { defaultLayout } from '../domain/seed';
import { MemoryLayoutRepository } from '../repository/memoryRepository';
import { alignSelection, moveStallsBy, runBookingAction } from './actions';
import { resetLayoutStore, useLayoutStore } from './layoutStore';

const st = () => useLayoutStore.getState();

beforeEach(async () => {
  vi.useRealTimers();
  resetLayoutStore();
  await st().init(new MemoryLayoutRepository(defaultLayout()));
});

describe('undo / redo', () => {
  it('snapshots each commit and walks back and forward', () => {
    const original = st().data!;
    moveStallsBy(new Set([1]), 1, 0);
    moveStallsBy(new Set([1]), 1, 0);
    expect(st().data!.stalls[0]!.x).toBe(3);
    expect(st().history.past).toHaveLength(2);
    st().undo();
    expect(st().data!.stalls[0]!.x).toBe(2);
    st().undo();
    expect(st().data).toBe(original); // same reference — snapshots are free
    expect(st().undo()).toBe(false);
    st().redo();
    expect(st().data!.stalls[0]!.x).toBe(2);
  });

  it('a new commit clears the redo stack', () => {
    moveStallsBy(new Set([1]), 1, 0);
    st().undo();
    moveStallsBy(new Set([2]), 1, 0);
    expect(st().history.future).toHaveLength(0);
  });

  it('no-op mutations do not create history entries', () => {
    st().openEditor(1);
    st().setEditorStalls([1]);
    alignSelection('left'); // needs ≥2 → warns, no commit
    expect(st().history.past).toHaveLength(0);
  });

  it('prunes selections that point at removed entities', () => {
    st().openEditor(1);
    st().setEditorStalls([1, 2]);
    st().commit((d) => ({ ...d, stalls: d.stalls.filter((s) => s.id !== 2) }));
    expect([...st().editor.stallIds]).toEqual([1]);
    st().commit((d) => ({ ...d, hangars: d.hangars.filter((h) => h.id !== 1) }));
    expect(st().editor.hangarId).toBeNull();
  });

  it('booking transitions are undoable', () => {
    runBookingAction(1, 'reserve', 'Acme');
    expect(st().data!.stalls[0]!.status).toBe('reserved');
    st().undo();
    expect(st().data!.stalls[0]!.status).toBe('available');
  });

  it('confirm-guarded actions only run when accepted', () => {
    runBookingAction(1, 'block');
    expect(st().confirm?.title).toBe('Block Stall');
    st().resolveConfirm(false);
    expect(st().data!.stalls[0]!.status).toBe('available');
    runBookingAction(1, 'block');
    st().resolveConfirm(true);
    expect(st().data!.stalls[0]!.status).toBe('blocked');
  });
});

describe('autosave', () => {
  it('persists through the repository after a change', async () => {
    const repo = new MemoryLayoutRepository(defaultLayout());
    resetLayoutStore();
    await st().init(repo);
    moveStallsBy(new Set([1]), 1, 0);
    expect(st().saveStatus).toBe('dirty');
    await vi.waitFor(() => expect(repo.saveCount).toBe(1), { timeout: 2000 });
    expect(repo.saved!.stalls[0]!.x).toBe(2);
    expect(st().saveStatus).toBe('saved');
  });
});
