import { defaultLayout } from '../domain/seed';
import { CLEARED_KEY, LocalStorageLayoutRepository, STORAGE_KEYS } from './localStorageRepository';

describe('LocalStorageLayoutRepository', () => {
  beforeEach(() => localStorage.clear());

  it('seeds the demo layout when nothing is stored', async () => {
    const r = await new LocalStorageLayoutRepository().load();
    expect(r.source).toBe('default');
    expect(r.data!.stalls).toHaveLength(42);
  });

  it('round-trips the current schema', async () => {
    const repo = new LocalStorageLayoutRepository();
    const data = defaultLayout();
    data.ground.exhibitionName = 'Round Trip';
    await repo.save(data);
    const r = await repo.load();
    expect(r).toMatchObject({ source: 'current', fromVersion: 3 });
    expect(r.data).toEqual(data);
  });

  it('migrates v2 → v3 and writes the current key', async () => {
    const { annotations: _drop, ...v2 } = defaultLayout();
    localStorage.setItem(STORAGE_KEYS[2]!, JSON.stringify(v2));
    const r = await new LocalStorageLayoutRepository().load();
    expect(r).toMatchObject({ source: 'migrated', fromVersion: 2 });
    expect(r.data!.annotations).toEqual([]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS[3]!)!).annotations).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS[2]!)).not.toBeNull(); // non-destructive
  });

  it('tolerates a v3 payload missing annotations (as the original did)', async () => {
    const { annotations: _drop, ...rest } = defaultLayout();
    localStorage.setItem(STORAGE_KEYS[3]!, JSON.stringify(rest));
    expect((await new LocalStorageLayoutRepository().load()).data!.annotations).toEqual([]);
  });

  it('skips corrupt data and falls back to an older valid key', async () => {
    localStorage.setItem(STORAGE_KEYS[3]!, '{"ground":42}');
    const { annotations: _drop, ...v2 } = defaultLayout();
    localStorage.setItem(STORAGE_KEYS[2]!, JSON.stringify(v2));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await new LocalStorageLayoutRepository().load()).source).toBe('migrated');
  });

  it('stays empty after reset instead of re-seeding', async () => {
    const repo = new LocalStorageLayoutRepository();
    await repo.save(defaultLayout());
    await repo.reset();
    expect(localStorage.getItem(CLEARED_KEY)).toBe('1');
    expect(await repo.load()).toMatchObject({ data: null, source: 'empty' });
  });
});
