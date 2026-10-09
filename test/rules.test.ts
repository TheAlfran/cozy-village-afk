import { describe, expect, it } from 'vitest';
import { BAITS, EQUIPMENT, GEAR_SET_SLOTS, FISH, GEAR_SETS, RODS, createDefaultSave, sanitizeSave } from '../src/shared/model.js';
import { activeBait, addXp, awardCatch, buyBait, buyEquipment, buyGearSet, buyRod, chooseFish, consumeBait, effectiveInventoryCapacity, effectiveRodStats, enhanceItem, enhancementChance, enhancementCost, equipmentBonus, equippedGearSet, equipGearSet, equipRod, gearSetItems, inventoryCount, lakeMaterialDrop, normalizedMovement, selectBait, sellAll, sellFish } from '../src/shared/rules.js';

describe('fish selection', () => {
  it('unlocks all 20 Area 1 fish progressively through rods', () => {
    expect(FISH).toHaveLength(20);
    expect(new Set(FISH.map((fish) => fish.id)).size).toBe(20);
    expect(FISH.reduce((total, fish) => total + fish.weight, 0)).toBe(100);
    expect(RODS.every((rod) => FISH.some((fish) => fish.minRod === rod.id))).toBe(true);
    for (const [rank, rod] of RODS.entries()) {
      const eligible = FISH.filter((fish) => RODS.findIndex((candidate) => candidate.id === fish.minRod) <= rank);
      const catches = new Set(Array.from({ length: 2000 }, (_, index) => chooseFish((index + 0.5) / 2000, undefined, 0, rod.id).id));
      expect(catches).toEqual(new Set(eligible.map((fish) => fish.id)));
    }
    let cumulativeWeight = 0;
    for (const fish of FISH) {
      expect(fish.weight).toBeGreaterThan(0);
      expect(chooseFish((cumulativeWeight + fish.weight / 2) / 100, undefined, 0, 'celestial').id).toBe(fish.id);
      cumulativeWeight += fish.weight;
    }
    expect(chooseFish(1, undefined, 0, 'celestial').id).toBe('starfin');
    expect(chooseFish(1).rarity).toBe('Common');
  });

  it('makes high rarity fish more likely with stronger bait without bypassing rod limits', () => {
    const bait = BAITS.find((item) => item.id === 'moonMoths');
    const rareCount = (withBait: boolean) => Array.from({ length: 1000 }, (_, index) =>
      chooseFish((index + 0.5) / 1000, withBait ? bait : undefined, 0, 'celestial'))
      .filter((fish) => fish.rarity === 'Epic' || fish.rarity === 'Legendary').length;
    expect(rareCount(true)).toBeGreaterThan(rareCount(false));
    expect(chooseFish(0.99, BAITS[4], 100, 'starter').rarity).toBe('Common');
  });
});

describe('progress and economy', () => {
  it('finds lake materials by rarity and keeps them through save reloads', () => {
    const state = createDefaultSave();
    expect(lakeMaterialDrop('Common', 0.9)).toBeUndefined();
    expect(lakeMaterialDrop('Rare', 0.1)).toBe('riverCrystal');
    expect(lakeMaterialDrop('Legendary', 0.1)).toBe('starShard');
    expect(awardCatch(state, FISH[0]!, 0).material).toBe('lakeIron');
    expect(state.materials.lakeIron).toBe(1);
    expect(sanitizeSave(state).materials.lakeIron).toBe(1);
  });

  it('guarantees upgrades through +6, then makes +7 to +10 progressively harder', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(enhancementChance))
      .toEqual([1, 1, 1, 1, 1, 1, 0.7, 0.65, 0.6, 0.55]);
    const state = createDefaultSave();
    const firstCost = enhancementCost(state, 'starter')!;
    expect(enhanceItem(state, 'starter')).toBe('coins');
    state.coins = 10000;
    expect(enhanceItem(state, 'starter')).toBe('materials');
    state.materials = { lakeIron: 300, riverCrystal: 300, starShard: 300 };
    expect(enhanceItem(state, 'starter')).toBe('enhanced');
    expect(state.coins).toBe(10000 - firstCost.coins);
    expect(effectiveRodStats(state).xpBonus).toBe(1);
    state.equipment.torso = 'villagerTunic';
    expect(enhanceItem(state, 'villagerTunic')).toBe('enhanced');
    expect(equipmentBonus(state, 'xp')).toBe(1);
    for (let level = 1; level < 6; level += 1) expect(enhanceItem(state, 'starter', 0.999)).toBe('enhanced');
    const levelSevenCost = enhancementCost(state, 'starter')!;
    const coinsBeforeFailure = state.coins;
    const ironBeforeFailure = state.materials.lakeIron;
    expect(enhanceItem(state, 'starter', 0.7)).toBe('failed');
    expect(state.enhancements.starter).toBe(6);
    expect(state.coins).toBe(coinsBeforeFailure - levelSevenCost.coins);
    expect(state.materials.lakeIron).toBe(ironBeforeFailure - (levelSevenCost.materials.lakeIron ?? 0));
    for (const roll of [0.69, 0.64, 0.59, 0.54]) expect(enhanceItem(state, 'starter', roll)).toBe('enhanced');
    expect(enhanceItem(state, 'starter')).toBe('maxed');
    expect(sanitizeSave(state).enhancements.starter).toBe(10);
    expect(enhanceItem(state, 'celestial')).toBe('invalid');
  });
  it('offers five complete sets from Common through Legendary with increasing prices and bonuses', () => {
    expect(GEAR_SETS.map((set) => set.grade)).toEqual(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']);
    for (const [index, set] of GEAR_SETS.entries()) {
      const items = EQUIPMENT.filter((item) => item.setId === set.id);
      expect(items).toHaveLength(6);
      expect(new Set(items.map((item) => item.slot))).toEqual(new Set(GEAR_SET_SLOTS));
      expect(new Set(items.map((item) => item.id)).size).toBe(6);
      if (index > 0) {
        const previous = GEAR_SETS[index - 1]!;
        expect(set.basePrice).toBeGreaterThan(previous.basePrice);
        expect(set.completionXpBonus).toBeGreaterThan(previous.completionXpBonus);
        for (const slot of GEAR_SET_SLOTS) expect(set.bonuses[slot]).toBeGreaterThan(previous.bonuses[slot]);
      }
    }
  });

  it('buys remaining set pieces atomically and applies the full set bonus only while equipped', () => {
    const state = createDefaultSave();
    expect(buyGearSet(state, 'meadow')).toBe('insufficient');
    expect(state.ownedEquipment).toHaveLength(6);
    state.coins = 1000;
    expect(buyGearSet(state, 'meadow')).toBe('bought');
    const spent = gearSetItems('meadow').reduce((total, id) => total + (EQUIPMENT.find((item) => item.id === id)?.price ?? 0), 0);
    expect(state.coins).toBe(1000 - spent);
    expect(gearSetItems('meadow').every((id) => state.ownedEquipment.includes(id))).toBe(true);
    expect(equippedGearSet(state)?.id).toBe('meadow');
    expect(equipmentBonus(state, 'xp')).toBe(3);
    expect(buyGearSet(state, 'meadow')).toBe('owned');
    state.equipment.head = 'apprenticeHood';
    expect(equippedGearSet(state)).toBeUndefined();
    expect(equipmentBonus(state, 'xp')).toBe(1);
    expect(equipGearSet(state, 'meadow')).toBe(true);
    expect(sanitizeSave(state).equipment).toEqual(state.equipment);
  });

  it('offers five distinct purchasable baits', () => {
    expect(BAITS).toHaveLength(5);
    expect(new Set(BAITS.map((bait) => bait.id)).size).toBe(5);
    expect(BAITS.every((bait) => bait.price > 0 && bait.packSize > 0)).toBe(true);
  });

  it('buys equipment once, equips it, and applies its bag bonus', () => {
    const state = createDefaultSave();
    expect(buyEquipment(state, 'deepCreel')).toBe('insufficient');
    state.coins = 200;
    expect(buyEquipment(state, 'deepCreel')).toBe('bought');
    expect(state.coins).toBe(40);
    expect(buyEquipment(state, 'deepCreel')).toBe('owned');
    expect(effectiveInventoryCapacity(state)).toBe(25);
    expect(equipmentBonus(state, 'capacity')).toBe(5);
    expect(sanitizeSave(state).equipment.utility).toBe('deepCreel');
    state.inventoryCapacity = 1;
    state.inventory.minnow = 1;
    expect(awardCatch(state, FISH[0]!).stored).toBe(true);
  });

  it('applies equipped XP and luck accessories only while equipped', () => {
    const state = createDefaultSave();
    state.coins = 600;
    expect(buyEquipment(state, 'lakeVest')).toBe('bought');
    expect(buyEquipment(state, 'luckyPendant')).toBe('bought');
    expect(equipmentBonus(state, 'xp')).toBe(2);
    expect(equipmentBonus(state, 'luck')).toBeCloseTo(0.2);
    awardCatch(state, FISH[0]!);
    expect(state.player.xp).toBe(10);
    state.equipment.jewelry = null;
    expect(equipmentBonus(state, 'luck')).toBe(0);
  });
  it('buys bait in packs, consumes one per attempt, and saves remaining stock', () => {
    const state = createDefaultSave();
    expect(buyBait(state, 'worms')).toBe('insufficient');
    state.coins = 20;
    expect(buyBait(state, 'worms')).toBe('bought');
    expect(state.coins).toBe(10);
    expect(state.baitInventory.worms).toBe(5);
    expect(state.selectedBait).toBe('worms');
    expect(selectBait(state, 'moonMoths')).toBe(false);
    expect(activeBait(state)?.id).toBe('worms');
    for (let attempt = 0; attempt < 5; attempt += 1) expect(consumeBait(state)?.id).toBe('worms');
    expect(state.baitInventory.worms).toBe(0);
    expect(state.selectedBait).toBeNull();
    expect(consumeBait(state)).toBeUndefined();
    expect(sanitizeSave(state).baitInventory.worms).toBe(0);
  });
  it('offers ten increasingly strong purchasable rods', () => {
    const rods = RODS.filter((rod) => rod.price > 0);
    expect(rods).toHaveLength(10);
    for (let index = 1; index < rods.length; index += 1) {
      expect(rods[index]!.price).toBeGreaterThan(rods[index - 1]!.price);
      expect(rods[index]!.zoneBonus).toBeGreaterThan(rods[index - 1]!.zoneBonus);
      expect(rods[index]!.xpBonus).toBeGreaterThan(rods[index - 1]!.xpBonus);
    }
    expect(RODS.find((rod) => rod.id === 'celestial')?.price).toBe(24000);
    expect(GEAR_SETS.find((set) => set.id === 'starfall')?.basePrice).toBe(8000);
    expect(EQUIPMENT.find((item) => item.id === 'pearlRing')?.price).toBe(1500);
  });

  it('spends coins once, saves ownership, and applies equipped rod XP', () => {
    const state = createDefaultSave();
    expect(buyRod(state, 'willow')).toBe('insufficient');
    state.coins = 40;
    expect(buyRod(state, 'willow')).toBe('bought');
    expect(state.coins).toBe(5);
    expect(buyRod(state, 'willow')).toBe('owned');
    expect(equipRod(state, 'celestial')).toBe(false);
    const restored = sanitizeSave(state);
    expect(restored.equippedRod).toBe('willow');
    awardCatch(restored, FISH[0]!);
    expect(restored.player.xp).toBe(9);
  });
  it('rolls XP over through multiple levels', () => {
    expect(addXp(1, 90, 250, (level) => level * 100)).toEqual({ level: 3, xp: 40 });
  });

  it('awards XP and a coin even when inventory is full', () => {
    const state = createDefaultSave();
    state.inventoryCapacity = 0;
    const result = awardCatch(state, FISH[0]!);
    expect(result.stored).toBe(false);
    expect(state.discoveredFish).toEqual(['minnow']);
    expect(state.coins).toBe(1);
    expect(state.player.xp).toBe(8);
    expect(inventoryCount(state)).toBe(0);
  });

  it('sells one stack or the full inventory', () => {
    const state = createDefaultSave();
    state.inventory.minnow = 2;
    state.inventory.salmon = 1;
    expect(sellFish(state, 'minnow')).toBe(10);
    expect(sellAll(state)).toBe(55);
    expect(state.coins).toBe(65);
    expect(inventoryCount(state)).toBe(0);
  });

  it('stores and sells a newly added Area 1 fish', () => {
    const state = createDefaultSave();
    const fish = FISH.find((item) => item.id === 'crystalEel')!;
    expect(awardCatch(state, fish).stored).toBe(true);
    expect(state.inventory.crystalEel).toBe(1);
    expect(sellFish(state, 'crystalEel')).toBe(fish.value);
    expect(state.inventory.crystalEel).toBe(0);
    expect(state.discoveredFish).toContain('crystalEel');
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
