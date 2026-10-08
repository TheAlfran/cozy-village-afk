export const SAVE_KEY = 'cozyVillage.save';
export const SAVE_VERSION = 1 as const;
export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1400;

export type FishId = 'minnow' | 'perch' | 'salmon' | 'goldenCarp' | 'moonfish';
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type SceneId = 'village' | 'fishing';
export type EquipmentSlot = 'head' | 'torso' | 'hands' | 'feet' | 'jewelry' | 'utility';
export type EquipmentItemId = 'apprenticeHood' | 'villagerTunic' | 'workGloves' | 'leatherBoots' | 'copperCharm' | 'smallCreel';

export interface EquipmentDefinition {
  id: EquipmentItemId;
  slot: EquipmentSlot;
  name: string;
  symbol: string;
  description: string;
  futureBonus: string;
}

export interface FishDefinition {
  id: FishId;
  name: string;
  rarity: Rarity;
  weight: number;
  value: number;
  xp: number;
}

export interface GameSaveV1 {
  version: 1;
  player: { x: number; y: number; level: number; xp: number };
  fishing: { level: number; xp: number; autoEnabled: boolean };
  coins: number;
  inventory: Record<FishId, number>;
  inventoryCapacity: number;
  unlockedBuildings: string[];
  purchasedUpgrades: string[];
  ownedEquipment: EquipmentItemId[];
  equipment: Record<EquipmentSlot, EquipmentItemId | null>;
  scene: SceneId;
}

export type HostToWebviewMessage =
  | { type: 'loadState'; state: GameSaveV1 }
  | { type: 'resetState'; state: GameSaveV1 }
  | { type: 'setActive'; active: boolean };

export type WebviewToHostMessage =
  | { type: 'webviewReady' }
  | { type: 'saveState'; state: unknown }
  | { type: 'resetState' }
  | { type: 'openFullscreen' };

export const FISH: readonly FishDefinition[] = [
  { id: 'minnow', name: 'Minnow', rarity: 'Common', weight: 55, value: 5, xp: 8 },
  { id: 'perch', name: 'Perch', rarity: 'Uncommon', weight: 25, value: 12, xp: 12 },
  { id: 'salmon', name: 'Salmon', rarity: 'Rare', weight: 12, value: 30, xp: 20 },
  { id: 'goldenCarp', name: 'Golden Carp', rarity: 'Epic', weight: 6, value: 75, xp: 35 },
  { id: 'moonfish', name: 'Moonfish', rarity: 'Legendary', weight: 2, value: 200, xp: 75 },
] as const;

export const EQUIPMENT: readonly EquipmentDefinition[] = [
  { id: 'apprenticeHood', slot: 'head', name: 'Apprentice Hood', symbol: 'HD', description: 'A plain wool hood for cold mornings.', futureBonus: 'Luck' },
  { id: 'villagerTunic', slot: 'torso', name: 'Villager Tunic', symbol: 'TN', description: 'Simple green clothing for a new adventurer.', futureBonus: 'Fishing Power' },
  { id: 'workGloves', slot: 'hands', name: 'Work Gloves', symbol: 'GL', description: 'Sturdy gloves with reinforced palms.', futureBonus: 'Reel Control' },
  { id: 'leatherBoots', slot: 'feet', name: 'Leather Boots', symbol: 'BT', description: 'Well-worn boots made for village paths.', futureBonus: 'Move Speed' },
  { id: 'copperCharm', slot: 'jewelry', name: 'Copper Charm', symbol: 'CH', description: 'A humble charm on a braided cord.', futureBonus: 'Luck' },
  { id: 'smallCreel', slot: 'utility', name: 'Small Creel', symbol: 'CR', description: 'A woven hip basket for a fisher.', futureBonus: 'Bag Capacity' },
] as const;

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ['head', 'torso', 'hands', 'feet', 'jewelry', 'utility'];

export function createDefaultSave(): GameSaveV1 {
  return {
    version: SAVE_VERSION,
    player: { x: 320, y: 700, level: 1, xp: 0 },
    fishing: { level: 1, xp: 0, autoEnabled: false },
    coins: 0,
    inventory: { minnow: 0, perch: 0, salmon: 0, goldenCarp: 0, moonfish: 0 },
    inventoryCapacity: 20,
    unlockedBuildings: ['market'],
    purchasedUpgrades: [],
    ownedEquipment: EQUIPMENT.map((item) => item.id),
    equipment: { head: null, torso: 'villagerTunic', hands: null, feet: null, jewelry: null, utility: null },
    scene: 'village',
  };
}

const finite = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function sanitizeSave(value: unknown): GameSaveV1 {
  const defaults = createDefaultSave();
  if (!value || typeof value !== 'object') return defaults;
  const raw = value as Record<string, unknown>;
  const player = raw.player && typeof raw.player === 'object' ? raw.player as Record<string, unknown> : {};
  const fishing = raw.fishing && typeof raw.fishing === 'object' ? raw.fishing as Record<string, unknown> : {};
  const inventory = raw.inventory && typeof raw.inventory === 'object' ? raw.inventory as Record<string, unknown> : {};
  const ownedEquipment = Array.isArray(raw.ownedEquipment)
    ? raw.ownedEquipment.filter((id): id is EquipmentItemId => EQUIPMENT.some((item) => item.id === id))
    : defaults.ownedEquipment;
  const rawEquipment = raw.equipment && typeof raw.equipment === 'object'
    ? raw.equipment as Record<string, unknown>
    : defaults.equipment;
  const equipment = Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => {
    const id = rawEquipment[slot];
    const valid = typeof id === 'string'
      && ownedEquipment.includes(id as EquipmentItemId)
      && EQUIPMENT.some((item) => item.id === id && item.slot === slot);
    return [slot, valid ? id : null];
  })) as Record<EquipmentSlot, EquipmentItemId | null>;

  return {
    version: SAVE_VERSION,
    player: {
      x: finite(player.x, defaults.player.x, 24, WORLD_WIDTH - 24),
      y: finite(player.y, defaults.player.y, 24, WORLD_HEIGHT - 24),
      level: Math.floor(finite(player.level, 1, 1)),
      xp: Math.floor(finite(player.xp, 0)),
    },
    fishing: {
      level: Math.floor(finite(fishing.level, 1, 1)),
      xp: Math.floor(finite(fishing.xp, 0)),
      autoEnabled: fishing.autoEnabled === true,
    },
    coins: Math.floor(finite(raw.coins, 0)),
    inventory: Object.fromEntries(FISH.map((fish) => [fish.id, Math.floor(finite(inventory[fish.id], 0))])) as Record<FishId, number>,
    inventoryCapacity: Math.floor(finite(raw.inventoryCapacity, 20, 1, 9999)),
    unlockedBuildings: Array.isArray(raw.unlockedBuildings)
      ? raw.unlockedBuildings.filter((item): item is string => typeof item === 'string')
      : ['market'],
    purchasedUpgrades: Array.isArray(raw.purchasedUpgrades)
      ? raw.purchasedUpgrades.filter((item): item is string => typeof item === 'string')
      : [],
    ownedEquipment,
    equipment,
    scene: raw.scene === 'fishing' ? 'fishing' : 'village',
  };
}
