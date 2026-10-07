import { describe, expect, it } from 'vitest';
import { FishingSession } from '../src/webview/fishing.js';

describe('manual fishing state machine', () => {
  it('casts, bites, catches, and returns to ready', () => {
    const session = new FishingSession();
    expect(session.cast(100, () => 0)).toBe(true);
    expect(session.phase).toBe('waiting');
    expect(session.update(2099)).toBeUndefined();
    expect(session.update(2100)).toBe('bite');
    expect(session.reel(2200)).toBe(true);
    expect(session.phase).toBe('caught');
    expect(session.update(2951)).toBe('ready');
  });

  it('misses after the 1.2 second reaction window', () => {
    const session = new FishingSession();
    session.cast(0, () => 0);
    session.update(2000);
    expect(session.update(3201)).toBe('miss');
    expect(session.reel(3202)).toBe(false);
  });
});
