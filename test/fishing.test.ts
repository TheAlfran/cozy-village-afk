import { describe, expect, it } from 'vitest';
import { catchZoneWidth, escapeWindowMs, FishingSession, markerCycleMs } from '../src/webview/fishing.js';

describe('manual fishing state machine', () => {
  it('catches when the moving marker overlaps the random target', () => {
    const session = new FishingSession();
    expect(session.cast(100, () => 0.5)).toBe(true);
    expect(session.phase).toBe('waiting');
    expect(session.targetCenter).toBeCloseTo(0.5);
    expect(session.markerPosition(750)).toBeCloseTo(0.5);
    expect(session.reel(750)).toBe(true);
    expect(session.phase).toBe('caught');
    expect(session.update(1501)).toBe('ready');
  });

  it('misses when Space is pressed outside the target zone', () => {
    const session = new FishingSession();
    session.cast(0, () => 1, catchZoneWidth('Rare'));
    expect(session.targetCenter).toBeCloseTo(0.89);
    expect(session.markerPosition(0)).toBe(0);
    expect(session.reel(0)).toBe(false);
    expect(session.phase).toBe('missed');
  });

  it('shrinks the catch zone as fish rarity increases', () => {
    expect(catchZoneWidth('Common')).toBeGreaterThan(catchZoneWidth('Uncommon'));
    expect(catchZoneWidth('Uncommon')).toBeGreaterThan(catchZoneWidth('Rare'));
    expect(catchZoneWidth('Rare')).toBeGreaterThan(catchZoneWidth('Epic'));
    expect(catchZoneWidth('Epic')).toBeGreaterThan(catchZoneWidth('Legendary'));
  });

  it('moves the marker faster as fish rarity increases', () => {
    expect(markerCycleMs('Common')).toBeGreaterThan(markerCycleMs('Uncommon'));
    expect(markerCycleMs('Uncommon')).toBeGreaterThan(markerCycleMs('Rare'));
    expect(markerCycleMs('Rare')).toBeGreaterThan(markerCycleMs('Epic'));
    expect(markerCycleMs('Epic')).toBeGreaterThan(markerCycleMs('Legendary'));
  });

  it('lets rarer fish escape sooner when Space is not pressed', () => {
    expect(escapeWindowMs('Common')).toBeGreaterThan(escapeWindowMs('Rare'));
    expect(escapeWindowMs('Rare')).toBeGreaterThan(escapeWindowMs('Epic'));
    expect(escapeWindowMs('Epic')).toBeGreaterThan(escapeWindowMs('Legendary'));

    const session = new FishingSession();
    session.cast(100, () => 0.5, catchZoneWidth('Legendary'), markerCycleMs('Legendary'), escapeWindowMs('Legendary'));
    expect(session.update(1999)).toBeUndefined();
    expect(session.update(2000)).toBe('escape');
    expect(session.phase).toBe('missed');
  });
});
