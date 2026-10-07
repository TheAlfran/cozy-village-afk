import { describe, expect, it } from 'vitest';
import { FISH, createDefaultSave } from '../src/shared/model.js';
import { addXp, awardCatch, chooseFish, inventoryCount, normalizedMovement, sellAll, sellFish } from '../src/shared/rules.js';

describe('fish selection', () => {
  it('honors rarity weight boundaries', () => {
    expect(chooseFish(0).id).toBe('minnow');
    expect(chooseFish(0.54999).id).toBe('minnow');
    expect(chooseFish(0.55).id).toBe('perch');
    expect(chooseFish(0.80).id).toBe('salmon');
    expect(chooseFish(0.92).id).toBe('goldenCarp');
    expect(chooseFish(0.98).id).toBe('moonfish');
    expect(chooseFish(1).id).toBe('moonfish');
  });
});

describe('progress and economy', () => {
  it('rolls XP over through multiple levels', () => {
    expect(addXp(1, 90, 250, (level) => level * 100)).toEqual({ level: 3, xp: 40 });
  });

  it('awards XP and a coin even when inventory is full', () => {
    const state = createDefaultSave();
    state.inventoryCapacity = 0;
    const result = awardCatch(state, FISH[0]!);
    expect(result.stored).toBe(false);
    expect(state.coins).toBe(1);
    expect(state.player.xp).toBe(8);
    expect(inventoryCount(state)).toBe(0);
  });

  it('sells one stack or the full inventory', () => {
    const state = createDefaultSave();
    state.inventory.minnow = 2;
    state.inventory.salmon = 1;
    expect(sellFish(state, 'minnow')).toBe(10);
    expect(sellAll(state)).toBe(30);
    expect(state.coins).toBe(40);
    expect(inventoryCount(state)).toBe(0);
  });
});

describe('movement', () => {
  it('normalizes diagonals without changing cardinal speed', () => {
    expect(normalizedMovement(0, 0)).toEqual({ x: 0, y: 0 });
    expect(normalizedMovement(1, 0)).toEqual({ x: 1, y: 0 });
    const diagonal = normalizedMovement(1, 1);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
  });
});
