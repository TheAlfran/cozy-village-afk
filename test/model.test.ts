import { describe, expect, it } from 'vitest';
import { FISH, MAPS, MAP_LAYOUT_VERSION, createDefaultSave, sanitizeSave } from '../src/shared/model.js';

describe('save validation', () => {
  it('uses defaults for missing or corrupt data', () => {
    expect(sanitizeSave(undefined)).toEqual(createDefaultSave());
    expect(sanitizeSave('broken')).toEqual(createDefaultSave());
  });

  it('repairs invalid values and ignores unknown fields', () => {
    const state = sanitizeSave({
      version: 999,
      mapLayoutVersion: MAP_LAYOUT_VERSION,
      location: 'area1',
      player: { x: -50, y: 9999, level: 0, xp: -4 },
      fishing: { level: 3.8, xp: 12, autoEnabled: true },
      coins: Number.NaN,
      inventory: { minnow: 2.9, moonfish: -4 },
      baitInventory: { worms: -2, glowGrubs: 3.8, moonMoths: Number.POSITIVE_INFINITY },
      selectedBait: 'worms',
      inventoryCapacity: 0,
      unlockedBuildings: ['market', 7],
      purchasedUpgrades: ['rod'],
      scene: 'fishing',
      surprise: 'ignored',
    });
    expect(state.version).toBe(1);
    expect(state.player).toEqual({ x: 49, y: 851, level: 1, xp: 0 });
    expect(state.fishing).toEqual({ level: 3, xp: 12, autoEnabled: true });
    expect(state.coins).toBe(0);
    expect(state.inventory.minnow).toBe(2);
    expect(state.discoveredFish).toEqual(['minnow']);
    expect(state.inventory.moonfish).toBe(0);
    expect(Object.keys(state.inventory)).toHaveLength(FISH.length);
    expect(state.inventory.starfin).toBe(0);
    expect(state.baitInventory).toEqual({ worms: 0, glowGrubs: 3, crimsonLarvae: 0, moonMoths: 0, starNectar: 0 });
    expect(state.selectedBait).toBeNull();
    expect(state.inventoryCapacity).toBe(1);
    expect(state.ownedEquipment).toHaveLength(6);
    expect(state.equipment.torso).toBe('villagerTunic');
    expect(state.unlockedBuildings).toEqual(['market']);
    expect(state.scene).toBe('fishing');
  });

  it('keeps owned equipment in matching slots only', () => {
    const state = sanitizeSave({
      ownedEquipment: ['villagerTunic', 'workGloves', 'notReal'],
      equipment: { torso: 'villagerTunic', hands: 'workGloves', head: 'workGloves' },
    });
    expect(state.ownedEquipment).toEqual(['villagerTunic', 'workGloves']);
    expect(state.equipment.torso).toBe('villagerTunic');
    expect(state.equipment.hands).toBe('workGloves');
    expect(state.equipment.head).toBeNull();
    expect(state.equipment.ring).toBeNull();
  });

  it('moves an older equipped Pearl Ring into the new accessory slot', () => {
    const state = sanitizeSave({
      ownedEquipment: ['villagerTunic', 'pearlRing'],
      equipment: { torso: 'villagerTunic', jewelry: 'pearlRing' },
    });
    expect(state.equipment.jewelry).toBeNull();
    expect(state.equipment.ring).toBe('pearlRing');
    expect(sanitizeSave(state).equipment.ring).toBe('pearlRing');
  });

  it('keeps fish discoveries after fish are sold and ignores unknown species', () => {
    const saved = createDefaultSave();
    saved.discoveredFish = ['salmon', 'moonfish'];
    saved.inventory.salmon = 0;
    const restored = sanitizeSave({ ...saved, discoveredFish: ['salmon', 'moonfish', 'notReal', 'salmon'] });
    expect(restored.discoveredFish).toEqual(['salmon', 'moonfish']);
  });

  it('migrates the shared world without losing progress', () => {
    const old = createDefaultSave();
    old.mapLayoutVersion = 0;
    old.location = 'area1';
    old.scene = 'fishing';
    old.fishing.autoEnabled = true;
    old.player = { x: 1750, y: 780, level: 5, xp: 15 };
    old.inventory.salmon = 3;
    old.coins = 101;
    const saved = sanitizeSave(old);
    expect(saved.player).toEqual({ ...MAPS.hub.spawn, level: 5, xp: 15 });
    expect(saved.location).toBe('hub');
    expect(saved.scene).toBe('village');
    expect(saved.fishing.autoEnabled).toBe(false);
    expect(saved.inventory).toEqual(old.inventory);
    expect(saved.coins).toBe(101);
    expect(saved.equipment).toEqual(old.equipment);
    expect(sanitizeSave(saved)).toEqual(saved);
  });

  it('preserves the selected map on reload and disallows hub fishing', () => {
    const saved = createDefaultSave();
    saved.location = 'area1';
    saved.player = { ...saved.player, ...MAPS.area1.spawn };
    expect(sanitizeSave(saved)).toEqual(saved);
    saved.location = 'hub';
    saved.scene = 'fishing';
    saved.fishing.autoEnabled = true;
    expect(sanitizeSave(saved).scene).toBe('village');
    expect(sanitizeSave(saved).fishing.autoEnabled).toBe(false);
  });
});
