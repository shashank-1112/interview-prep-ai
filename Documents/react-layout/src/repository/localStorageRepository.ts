import { layoutDataSchema } from '../domain/schema';
import { defaultLayout } from '../domain/seed';
import type { StallLayoutData } from '../domain/types';
import type { LayoutLoadResult, LayoutRepository } from './LayoutRepository';

/** Current schema version — v3 added `annotations[]`. */
export const CURRENT_SCHEMA_VERSION = 3;

/** Keys are identical to the Angular app so existing browser data carries over. */
export const STORAGE_KEYS: Record<number, string> = {
  2: 'gs_stall_layout_v2',
  3: 'gs_stall_layout_v3',
};

/** Marker written by `reset()` so a cleared layout stays cleared across reloads. */
export const CLEARED_KEY = 'gs_stall_layout_cleared';

type Migration = (raw: unknown) => unknown;

/**
 * migrations[n] upgrades a version-n payload to version n+1. Add a new entry
 * (and a new STORAGE_KEYS row) whenever the schema changes.
 */
const MIGRATIONS: Record<number, Migration> = {
  2: (raw) => ({ ...(raw as object), annotations: [] }),
};

function normalizeCurrent(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !('annotations' in raw)) {
    return { ...raw, annotations: [] };
  }
  return raw;
}

export interface LocalStorageRepositoryOptions {
  storage?: Storage;
  /** Seed data used when nothing is stored yet. Defaults to the demo layout. */
  seed?: () => StallLayoutData;
}

export class LocalStorageLayoutRepository implements LayoutRepository {
  private readonly storage: Storage;
  private readonly seed: () => StallLayoutData;

  constructor(opts: LocalStorageRepositoryOptions = {}) {
    this.storage = opts.storage ?? window.localStorage;
    this.seed = opts.seed ?? defaultLayout;
  }

  async load(): Promise<LayoutLoadResult> {
    for (let version = CURRENT_SCHEMA_VERSION; version >= 2; version--) {
      const key = STORAGE_KEYS[version];
      if (!key) continue;
      const raw = this.readJson(key);
      if (raw === undefined) continue;

      let payload = version === CURRENT_SCHEMA_VERSION ? normalizeCurrent(raw) : raw;
      for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
        const migrate = MIGRATIONS[v];
        if (!migrate) throw new Error(`Missing layout migration from v${v}`);
        payload = migrate(payload);
      }
      const parsed = layoutDataSchema.safeParse(payload);
      if (!parsed.success) {
        console.warn(`[layout] Ignoring invalid data under "${key}"`, parsed.error.issues);
        continue;
      }
      if (version !== CURRENT_SCHEMA_VERSION) {
        // Persist under the current key; older keys are left untouched (non-destructive).
        await this.save(parsed.data);
      }
      return {
        data: parsed.data,
        source: version === CURRENT_SCHEMA_VERSION ? 'current' : 'migrated',
        fromVersion: version,
      };
    }
    if (this.safeGet(CLEARED_KEY) === '1') return { data: null, source: 'empty', fromVersion: null };
    return { data: this.seed(), source: 'default', fromVersion: null };
  }

  async save(data: StallLayoutData): Promise<void> {
    try {
      this.storage.setItem(STORAGE_KEYS[CURRENT_SCHEMA_VERSION]!, JSON.stringify(data));
      this.storage.removeItem(CLEARED_KEY);
    } catch (err) {
      // Private mode / quota exceeded — surface to the caller so the UI can warn.
      throw new Error(`Could not save layout: ${(err as Error).message}`);
    }
  }

  async reset(): Promise<void> {
    try {
      for (const key of Object.values(STORAGE_KEYS)) this.storage.removeItem(key);
      this.storage.setItem(CLEARED_KEY, '1');
    } catch {
      /* storage unavailable */
    }
  }

  getDefaultLayout(): StallLayoutData {
    return this.seed();
  }

  private safeGet(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  private readJson(key: string): unknown {
    const raw = this.safeGet(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }
}
