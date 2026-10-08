import { describe, expect, it } from 'vitest';
import { SAFE_SPAWN, ensureSafePosition, isPositionBlocked, movePlayer, nearbyInteraction } from '../src/webview/world.js';

describe('village world', () => {
  it('blocks movement through a building and permits open ground', () => {
    expect(movePlayer({ x: 145, y: 250 }, 20, 0).x).toBe(145);
    expect(movePlayer({ x: 400, y: 400 }, 10, 0).x).toBe(410);
  });

  it('repairs a saved position that is inside a building', () => {
    expect(isPositionBlocked({ x: 200, y: 220 })).toBe(true);
    expect(isPositionBlocked(SAFE_SPAWN)).toBe(false);
    expect(ensureSafePosition({ x: 200, y: 220 })).toEqual(SAFE_SPAWN);
    expect(ensureSafePosition({ x: 400, y: 400 })).toEqual({ x: 400, y: 400 });
  });

  it('detects lake, market, and locked-building interactions', () => {
    expect(nearbyInteraction({ x: 1050, y: 355 })?.kind).toBe('lake');
    expect(nearbyInteraction({ x: 265, y: 345 })?.kind).toBe('market');
    expect(nearbyInteraction({ x: 650, y: 275 })?.kind).toBe('locked');
    expect(nearbyInteraction({ x: 400, y: 500 })).toBeUndefined();
  });
});
