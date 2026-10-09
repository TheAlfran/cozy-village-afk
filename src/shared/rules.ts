import { BAITS, EQUIPMENT, GEAR_SET_SLOTS, FISH, GEAR_SETS, MAX_ENHANCEMENT, RODS, type BaitDefinition, type BaitId, type EnhanceableId, type EquipmentBonusKind, type EquipmentItemId, type FishDefinition, type FishId, type GameSaveV1, type GearSetDefinition, type GearSetId, type MaterialId, type Rarity, type RodId } from './model.js';

const RARITY_ORDER: readonly Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

export function equipmentBonus(state: GameSaveV1, kind: EquipmentBonusKind): number {
  const pieceBonus = EQUIPMENT.reduce((total, item) => {
    if (state.equipment[item.slot] !== item.id) return total;
    const itemKind = item.bonusKind ?? (
      item.slot === 'head' || item.slot === 'jewelry' || item.slot === 'ring' ? 'luck'
        : item.slot === 'torso' ? 'xp' : item.slot === 'hands' ? 'zone'
          : item.slot === 'feet' ? 'speed' : 'capacity');
    if (itemKind !== kind) return total;
    const level = state.enhancements[item.id] ?? 0;
    const perLevel = { xp: 1, capacity: 2, luck: 0.03, zone: 0.005, speed: 0.02 }[kind];
    return total + (item.bonusAmount ?? 0) + level * perLevel;
  }, 0);
  return pieceBonus + (kind === 'xp' ? equippedGearSet(state)?.completionXpBonus ?? 0 : 0);
}

export function equippedGearSet(state: GameSaveV1): GearSetDefinition | undefined {
  return GEAR_SETS.find((set) => GEAR_SET_SLOTS.every((slot) =>
    EQUIPMENT.some((item) => item.setId === set.id && item.slot === slot && state.equipment[slot] === item.id)));
}

export function gearSetItems(id: GearSetId): EquipmentItemId[] {
  return EQUIPMENT.filter((item) => item.setId === id).map((item) => item.id);
}

export function buyGearSet(state: GameSaveV1, id: GearSetId): 'bought' | 'owned' | 'insufficient' | 'invalid' {
  if (!GEAR_SETS.some((set) => set.id === id)) return 'invalid';
  const missing = EQUIPMENT.filter((item) => item.setId === id && !state.ownedEquipment.includes(item.id));
  if (!missing.length) return 'owned';
  const price = missing.reduce((total, item) => total + (item.price ?? 0), 0);
  if (state.coins < price) return 'insufficient';
  state.coins -= price;
  for (const item of missing) state.ownedEquipment.push(item.id);
  equipGearSet(state, id);
  return 'bought';
}

export function equipGearSet(state: GameSaveV1, id: GearSetId): boolean {
  if (!GEAR_SETS.some((set) => set.id === id)) return false;
  const items = EQUIPMENT.filter((item) => item.setId === id);
  if (items.length !== GEAR_SET_SLOTS.length || items.some((item) => !state.ownedEquipment.includes(item.id))) return false;
  for (const item of items) state.equipment[item.slot] = item.id;
  return true;
}

export function effectiveInventoryCapacity(state: GameSaveV1): number {
  return state.inventoryCapacity + Math.round(equipmentBonus(state, 'capacity'));
}

export function effectiveRodStats(state: GameSaveV1): { zoneBonus: number; cycleBonusMs: number; escapeBonusMs: number; xpBonus: number } {
  const rod = RODS.find((item) => item.id === state.equippedRod) ?? RODS[0]!;
  const level = state.enhancements[rod.id] ?? 0;
  return {
    zoneBonus: rod.zoneBonus + level * 0.005,
    cycleBonusMs: rod.cycleBonusMs + level * 30,
    escapeBonusMs: rod.escapeBonusMs + level * 80,
    xpBonus: rod.xpBonus + level,
  };
}

export function enhancementChance(targetLevel: number): number {
  if (targetLevel < 1 || targetLevel > MAX_ENHANCEMENT) return 0;
  return targetLevel <= 6 ? 1 : (70 - (targetLevel - 7) * 5) / 100;
}

export function enhancementCost(state: GameSaveV1, id: EnhanceableId): { coins: number; materials: Partial<Record<MaterialId, number>> } | undefined {
  const rod = RODS.find((item) => item.id === id);
  const equipment = EQUIPMENT.find((item) => item.id === id);
  if (!rod && !equipment) return undefined;
  if (rod ? !state.ownedRods.includes(rod.id) : !state.ownedEquipment.includes(equipment!.id)) return undefined;
  const level = state.enhancements[id] ?? 0;
  if (level >= MAX_ENHANCEMENT) return undefined;
  const basePrice = rod?.price || equipment?.price || 30;
  return {
    coins: Math.max(15, Math.round(basePrice * (0.2 + level * 0.12))),
    materials: level < 2 ? { lakeIron: 2 + level * 2 }
      : level < 4 ? { lakeIron: 4 + level, riverCrystal: level - 1 }
        : level === 4 ? { lakeIron: 8, riverCrystal: 4, starShard: 2 }
          : { lakeIron: 8 + (level - 4) * 2, riverCrystal: 4 + (level - 4) * 2, starShard: 2 + (level - 4) },
  };
}

export function enhanceItem(state: GameSaveV1, id: EnhanceableId, roll = Math.random()): 'enhanced' | 'failed' | 'materials' | 'coins' | 'maxed' | 'invalid' {
  const level = state.enhancements[id] ?? 0;
  if (level >= MAX_ENHANCEMENT && (state.ownedRods.includes(id as RodId) || state.ownedEquipment.includes(id as EquipmentItemId))) return 'maxed';
  const cost = enhancementCost(state, id);
  if (!cost) return 'invalid';
  if (state.coins < cost.coins) return 'coins';
  if (Object.entries(cost.materials).some(([material, amount]) => state.materials[material as MaterialId] < amount)) return 'materials';
  state.coins -= cost.coins;
  for (const [material, amount] of Object.entries(cost.materials)) state.materials[material as MaterialId] -= amount;
  if (Math.min(0.999999, Math.max(0, roll)) >= enhancementChance(level + 1)) return 'failed';
  state.enhancements[id] = level + 1;
  return 'enhanced';
}

export function lakeMaterialDrop(rarity: Rarity, roll: number): MaterialId | undefined {
  const chance = Math.min(0.999999, Math.max(0, roll));
  if (rarity === 'Legendary') return chance < 0.35 ? 'starShard' : chance < 0.7 ? 'riverCrystal' : chance < 0.9 ? 'lakeIron' : undefined;
  if (rarity === 'Epic') return chance < 0.12 ? 'starShard' : chance < 0.45 ? 'riverCrystal' : chance < 0.75 ? 'lakeIron' : undefined;
  if (rarity === 'Rare') return chance < 0.2 ? 'riverCrystal' : chance < 0.65 ? 'lakeIron' : undefined;
  return chance < (rarity === 'Uncommon' ? 0.45 : 0.3) ? 'lakeIron' : undefined;
}

export function buyEquipment(state: GameSaveV1, id: EquipmentItemId): 'bought' | 'owned' | 'insufficient' | 'invalid' {
  const item = EQUIPMENT.find((candidate) => candidate.id === id && (candidate.price ?? 0) > 0);
  if (!item) return 'invalid';
  if (state.ownedEquipment.includes(id)) return 'owned';
  if (state.coins < item.price!) return 'insufficient';
  state.coins -= item.price!;
  state.ownedEquipment.push(id);
  state.equipment[item.slot] = id;
  return 'bought';
}

export function buyBait(state: GameSaveV1, id: BaitId): 'bought' | 'insufficient' | 'invalid' {
  const bait = BAITS.find((item) => item.id === id);
  if (!bait) return 'invalid';
  if (state.coins < bait.price) return 'insufficient';
  state.coins -= bait.price;
  state.baitInventory[id] += bait.packSize;
  if (!state.selectedBait) state.selectedBait = id;
  return 'bought';
}

export function selectBait(state: GameSaveV1, id: BaitId | null): boolean {
  if (id === null) { state.selectedBait = null; return true; }
  if (!BAITS.some((bait) => bait.id === id) || state.baitInventory[id] <= 0) return false;
  state.selectedBait = id;
  return true;
}

export function activeBait(state: GameSaveV1): BaitDefinition | undefined {
  return BAITS.find((bait) => bait.id === state.selectedBait && state.baitInventory[bait.id] > 0);
}

export function consumeBait(state: GameSaveV1): BaitDefinition | undefined {
  const bait = activeBait(state);
  if (!bait) return undefined;
  state.baitInventory[bait.id] -= 1;
  if (state.baitInventory[bait.id] === 0) state.selectedBait = null;
  return bait;
}

export function buyRod(state: GameSaveV1, id: RodId): 'bought' | 'owned' | 'insufficient' | 'invalid' {
  const rod = RODS.find((item) => item.id === id && item.price > 0);
  if (!rod) return 'invalid';
  if (state.ownedRods.includes(id)) return 'owned';
  if (state.coins < rod.price) return 'insufficient';
  state.coins -= rod.price;
  state.ownedRods.push(id);
  state.equippedRod = id;
  return 'bought';
}

export function equipRod(state: GameSaveV1, id: RodId): boolean {
  if (!state.ownedRods.includes(id) || !RODS.some((rod) => rod.id === id)) return false;
  state.equippedRod = id;
  return true;
}

export function chooseFish(roll: number, bait?: BaitDefinition, luckBonus = 0, rodId: RodId = 'starter'): FishDefinition {
  const normalized = Math.min(0.999999, Math.max(0, roll));
  const rodRank = Math.max(0, RODS.findIndex((rod) => rod.id === rodId));
  const availableFish = FISH.filter((fish) => RODS.findIndex((rod) => rod.id === fish.minRod) <= rodRank);
  const weight = (fish: FishDefinition): number => fish.weight *
    (bait && RARITY_ORDER.indexOf(fish.rarity) >= RARITY_ORDER.indexOf(bait.minRarity) ? bait.rarityMultiplier : 1) *
    (RARITY_ORDER.indexOf(fish.rarity) >= RARITY_ORDER.indexOf('Rare') ? 1 + luckBonus : 1);
  let cursor = normalized * availableFish.reduce((total, fish) => total + weight(fish), 0);
  for (const fish of availableFish) {
    cursor -= weight(fish);
    if (cursor < 0) return fish;
  }
  return availableFish[availableFish.length - 1]!;
}

export function inventoryCount(state: GameSaveV1): number {
  return Object.values(state.inventory).reduce((total, amount) => total + amount, 0);
}

export function addXp(level: number, xp: number, gain: number, threshold: (level: number) => number): { level: number; xp: number } {
  let nextLevel = level;
  let nextXp = xp + gain;
  while (nextXp >= threshold(nextLevel)) {
    nextXp -= threshold(nextLevel);
    nextLevel += 1;
  }
  return { level: nextLevel, xp: nextXp };
}

export function awardCatch(state: GameSaveV1, fish: FishDefinition, materialRoll = Math.random()): { stored: boolean; leveled: boolean; material?: MaterialId } {
  const beforePlayer = state.player.level;
  const beforeFishing = state.fishing.level;
  const earnedXp = fish.xp + effectiveRodStats(state).xpBonus + equipmentBonus(state, 'xp');
  const playerProgress = addXp(state.player.level, state.player.xp, earnedXp, (level) => 100 * level);
  const fishingProgress = addXp(state.fishing.level, state.fishing.xp, earnedXp, (level) => 75 * level);
  Object.assign(state.player, playerProgress);
  Object.assign(state.fishing, fishingProgress);
  state.coins += 1;
  const stored = inventoryCount(state) < effectiveInventoryCapacity(state);
  if (stored) state.inventory[fish.id] += 1;
  const material = stored ? lakeMaterialDrop(fish.rarity, materialRoll) : undefined;
  if (material) state.materials[material] += 1;
  if (!state.discoveredFish.includes(fish.id)) state.discoveredFish.push(fish.id);
  return { stored, leveled: beforePlayer !== state.player.level || beforeFishing !== state.fishing.level, material };
}

export function sellFish(state: GameSaveV1, fishId: FishId): number {
  const fish = FISH.find((item) => item.id === fishId);
  if (!fish) return 0;
  const quantity = state.inventory[fishId];
  const earned = quantity * fish.value;
  state.inventory[fishId] = 0;
  state.coins += earned;
  return earned;
}

export function sellAll(state: GameSaveV1): number {
  return FISH.reduce((total, fish) => total + sellFish(state, fish.id), 0);
}

export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }

export function normalizedMovement(x: number, y: number): Point {
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function distanceToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}
