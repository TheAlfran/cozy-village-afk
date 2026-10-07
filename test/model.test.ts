import { describe, expect, it } from 'vitest';
import { createDefaultSave, sanitizeSave } from '../src/shared/model.js';

describe('save validation', () => {
  it('uses defaults for missing or corrupt data', () => {
    expect(sanitizeSave(undefined)).toEqual(createDefaultSave());
    expect(sanitizeSave('broken')).toEqual(createDefaultSave());
  });

  it('repairs invalid values and ignores unknown fields', () => {
    const state = sanitizeSave({
      version: 999,
      player: { x: -50, y: 9999, level: 0, xp: -4 },
      fishing: { level: 3.8, xp: 12, autoEnabled: true },
      coins: Number.NaN,
      inventory: { minnow: 2.9, moonfish: -4 },
      inventoryCapacity: 0,
      unlockedBuildings: ['market', 7],
      purchasedUpgrades: ['rod'],
      scene: 'fishing',
      surprise: 'ignored',
    });
    expect(state.version).toBe(1);
    expect(state.player).toEqual({ x: 24, y: 516, level: 1, xp: 0 });
    expect(state.fishing).toEqual({ level: 3, xp: 12, autoEnabled: true });
    expect(state.coins).toBe(0);
    expect(state.inventory.minnow).toBe(2);
    expect(state.inventory.moonfish).toBe(0);
    expect(state.inventoryCapacity).toBe(1);
    expect(state.unlockedBuildings).toEqual(['market']);
    expect(state.scene).toBe('fishing');
  });
});
