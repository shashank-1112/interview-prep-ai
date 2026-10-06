import type { StallLayoutData } from '../domain/types';
import { defaultLayout } from '../domain/seed';
import type { LayoutLoadResult, LayoutRepository } from './LayoutRepository';

/** In-memory repository for tests and storybook-style demos. */
export class MemoryLayoutRepository implements LayoutRepository {
  saved: StallLayoutData | null;
  saveCount = 0;

  constructor(initial: StallLayoutData | null = defaultLayout()) {
    this.saved = initial ? structuredClone(initial) : null;
  }

  async load(): Promise<LayoutLoadResult> {
    return { data: this.saved ? structuredClone(this.saved) : null, source: this.saved ? 'current' : 'empty', fromVersion: 3 };
  }

  async save(data: StallLayoutData): Promise<void> {
    // Second `events` param intentionally unused — this repo has no audit trail to send them to.
    this.saved = structuredClone(data);
    this.saveCount++;
  }

  async reset(): Promise<void> {
    this.saved = null;
  }

  getDefaultLayout(): StallLayoutData {
    return defaultLayout();
  }
}
