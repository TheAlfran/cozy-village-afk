import { describe, expect, it } from 'vitest';
import { SaveStore } from '../src/extension/saveStore.js';
import { SAVE_KEY } from '../src/shared/model.js';

describe('SaveStore', () => {
  it('loads, saves, and resets through a memento-like store', async () => {
    const memory = new Map<string, unknown>();
    const memento = {
      get<T>(key: string, fallback?: T): T | undefined { return (memory.has(key) ? memory.get(key) : fallback) as T | undefined; },
      async update(key: string, value: unknown): Promise<void> { memory.set(key, value); },
    };
    const store = new SaveStore(memento);
    expect(store.load().coins).toBe(0);
    await store.save({ coins: 42 });
    expect(store.load().coins).toBe(42);
    await store.reset();
    expect((memory.get(SAVE_KEY) as { coins: number }).coins).toBe(0);
  });
});
