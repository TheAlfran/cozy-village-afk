import { describe, expect, it } from 'vitest';
import { movePlayer, nearbyInteraction } from '../src/webview/world.js';

describe('village world', () => {
  it('blocks movement through a building and permits open ground', () => {
    expect(movePlayer({ x: 55, y: 100 }, 20, 0).x).toBe(55);
    expect(movePlayer({ x: 300, y: 400 }, 10, 0).x).toBe(310);
  });

  it('detects lake, market, and locked-building interactions', () => {
    expect(nearbyInteraction({ x: 480, y: 130 })?.kind).toBe('lake');
    expect(nearbyInteraction({ x: 155, y: 205 })?.kind).toBe('market');
    expect(nearbyInteraction({ x: 785, y: 200 })?.kind).toBe('locked');
    expect(nearbyInteraction({ x: 300, y: 430 })).toBeUndefined();
  });
});
