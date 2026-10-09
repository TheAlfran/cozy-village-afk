export const SAVE_KEY = 'cozyVillage.save';
export const SAVE_VERSION = 1 as const;
export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1400;

export type FishId =
  | 'minnow' | 'bluegill' | 'sunfish' | 'dace' | 'carp'
  | 'perch' | 'trout' | 'catfish' | 'bass' | 'tilapia'
  | 'salmon' | 'pike' | 'koi' | 'sturgeon'
  | 'goldenCarp' | 'crystalEel' | 'rainbowTrout'
  | 'moonfish' | 'spiritKoi' | 'starfin';
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
export type SceneId = 'village' | 'fishing';
export type MapId = 'hub' | 'area1';
export const MAP_LAYOUT_VERSION = 1;
export const MAPS = {
  hub: { name: 'Village Hub', width: 960, height: 800, spawn: { x: 480, y: 500 } },
  area1: { name: 'Area 1 · Willow Lake', width: 1200, height: 900, spawn: { x: 600, y: 575 } },
} as const;
export type EquipmentSlot = 'head' | 'torso' | 'hands' | 'feet' | 'jewelry' | 'ring' | 'utility';
export type GearSetSlot = Exclude<EquipmentSlot, 'ring'>;
export type GearSetId = 'meadow' | 'pinewood' | 'riverstone' | 'sunfire' | 'starfall';
export type EquipmentItemId = 'apprenticeHood' | 'villagerTunic' | 'workGloves' | 'leatherBoots' | 'copperCharm' | 'smallCreel'
  | 'fisherHood' | 'lakeVest' | 'gripGloves' | 'marshBoots' | 'luckyPendant' | 'riverRing' | 'pearlRing' | 'deepCreel' | 'tackleBox'
  | `${GearSetId}${Capitalize<GearSetSlot>}`;
export type RodId = 'starter' | 'willow' | 'copper' | 'reed' | 'oak' | 'silver' | 'river' | 'golden' | 'storm' | 'moon' | 'celestial';
export type BaitId = 'worms' | 'glowGrubs' | 'crimsonLarvae' | 'moonMoths' | 'starNectar';
export type MaterialId = 'lakeIron' | 'riverCrystal' | 'starShard';
export type EnhanceableId = RodId | EquipmentItemId;
export const MAX_ENHANCEMENT = 10;
export const MATERIALS: readonly { id: MaterialId; name: string; symbol: string }[] = [
  { id: 'lakeIron', name: 'Lake Iron', symbol: 'LI' },
  { id: 'riverCrystal', name: 'River Crystal', symbol: 'RC' },
  { id: 'starShard', name: 'Star Shard', symbol: 'SS' },
];
export type EquipmentBonusKind = 'xp' | 'zone' | 'speed' | 'capacity' | 'luck';

export interface BaitDefinition {
  id: BaitId;
  name: string;
  price: number;
  packSize: number;
  minRarity: Rarity;
  rarityMultiplier: number;
}

export interface RodDefinition {
  id: RodId;
  name: string;
  description: string;
  grade: Rarity;
  price: number;
  zoneBonus: number;
  cycleBonusMs: number;
  escapeBonusMs: number;
  xpBonus: number;
}

export interface EquipmentDefinition {
  id: EquipmentItemId;
  slot: EquipmentSlot;
  name: string;
  symbol: string;
  description: string;
  futureBonus: string;
  price?: number;
  bonusKind?: EquipmentBonusKind;
  bonusAmount?: number;
  bonusLabel?: string;
  setId?: GearSetId;
  grade?: Rarity;
}

export interface GearSetDefinition {
  id: GearSetId;
  name: string;
  grade: Rarity;
  basePrice: number;
  completionXpBonus: number;
  bonuses: Record<GearSetSlot, number>;
}

export interface FishDefinition {
  id: FishId;
  name: string;
  rarity: Rarity;
  minRod: RodId;
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
  discoveredFish: FishId[];
  inventoryCapacity: number;
  unlockedBuildings: string[];
  purchasedUpgrades: string[];
  ownedEquipment: EquipmentItemId[];
  equipment: Record<EquipmentSlot, EquipmentItemId | null>;
  ownedRods: RodId[];
  equippedRod: RodId;
  baitInventory: Record<BaitId, number>;
  selectedBait: BaitId | null;
  materials: Record<MaterialId, number>;
  enhancements: Partial<Record<EnhanceableId, number>>;
  scene: SceneId;
  location: MapId;
  mapLayoutVersion: number;
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
  { id: 'minnow', name: 'Minnow', rarity: 'Common', minRod: 'starter', weight: 12, value: 5, xp: 8 },
  { id: 'bluegill', name: 'Bluegill', rarity: 'Common', minRod: 'starter', weight: 10, value: 7, xp: 9 },
  { id: 'sunfish', name: 'Sunfish', rarity: 'Common', minRod: 'starter', weight: 8, value: 9, xp: 10 },
  { id: 'dace', name: 'Silver Dace', rarity: 'Common', minRod: 'willow', weight: 7, value: 12, xp: 10 },
  { id: 'carp', name: 'Pond Carp', rarity: 'Common', minRod: 'copper', weight: 6, value: 15, xp: 11 },
  { id: 'perch', name: 'Perch', rarity: 'Uncommon', minRod: 'reed', weight: 8, value: 20, xp: 12 },
  { id: 'trout', name: 'Brook Trout', rarity: 'Uncommon', minRod: 'reed', weight: 7, value: 24, xp: 14 },
  { id: 'catfish', name: 'Whisker Catfish', rarity: 'Uncommon', minRod: 'oak', weight: 6, value: 30, xp: 15 },
  { id: 'bass', name: 'Lake Bass', rarity: 'Uncommon', minRod: 'oak', weight: 5, value: 36, xp: 16 },
  { id: 'tilapia', name: 'Emerald Tilapia', rarity: 'Uncommon', minRod: 'silver', weight: 4, value: 42, xp: 18 },
  { id: 'salmon', name: 'Salmon', rarity: 'Rare', minRod: 'silver', weight: 5, value: 55, xp: 20 },
  { id: 'pike', name: 'Northern Pike', rarity: 'Rare', minRod: 'river', weight: 4, value: 70, xp: 23 },
  { id: 'koi', name: 'Painted Koi', rarity: 'Rare', minRod: 'river', weight: 3, value: 85, xp: 26 },
  { id: 'sturgeon', name: 'Ancient Sturgeon', rarity: 'Rare', minRod: 'golden', weight: 3, value: 105, xp: 30 },
  { id: 'goldenCarp', name: 'Golden Carp', rarity: 'Epic', minRod: 'golden', weight: 3, value: 145, xp: 35 },
  { id: 'crystalEel', name: 'Crystal Eel', rarity: 'Epic', minRod: 'storm', weight: 2, value: 185, xp: 42 },
  { id: 'rainbowTrout', name: 'Rainbow Trout', rarity: 'Epic', minRod: 'moon', weight: 2, value: 230, xp: 50 },
  { id: 'moonfish', name: 'Moonfish', rarity: 'Legendary', minRod: 'moon', weight: 2, value: 400, xp: 75 },
  { id: 'spiritKoi', name: 'Spirit Koi', rarity: 'Legendary', minRod: 'celestial', weight: 2, value: 520, xp: 90 },
  { id: 'starfin', name: 'Starfin', rarity: 'Legendary', minRod: 'celestial', weight: 1, value: 700, xp: 110 },
] as const;

export const GEAR_SET_SLOTS: readonly GearSetSlot[] = ['head', 'torso', 'hands', 'feet', 'jewelry', 'utility'];
export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ['head', 'torso', 'hands', 'feet', 'jewelry', 'ring', 'utility'];

export const GEAR_SETS: readonly GearSetDefinition[] = [
  { id: 'meadow', name: 'Meadow', grade: 'Common', basePrice: 30, completionXpBonus: 2, bonuses: { head: 0.05, torso: 1, hands: 0.01, feet: 0.04, jewelry: 0.05, utility: 2 } },
  { id: 'pinewood', name: 'Pinewood', grade: 'Uncommon', basePrice: 180, completionXpBonus: 4, bonuses: { head: 0.1, torso: 2, hands: 0.02, feet: 0.07, jewelry: 0.1, utility: 4 } },
  { id: 'riverstone', name: 'Riverstone', grade: 'Rare', basePrice: 750, completionXpBonus: 7, bonuses: { head: 0.18, torso: 4, hands: 0.03, feet: 0.1, jewelry: 0.18, utility: 7 } },
  { id: 'sunfire', name: 'Sunfire', grade: 'Epic', basePrice: 2500, completionXpBonus: 11, bonuses: { head: 0.28, torso: 7, hands: 0.04, feet: 0.14, jewelry: 0.28, utility: 11 } },
  { id: 'starfall', name: 'Starfall', grade: 'Legendary', basePrice: 8000, completionXpBonus: 16, bonuses: { head: 0.4, torso: 11, hands: 0.05, feet: 0.18, jewelry: 0.4, utility: 16 } },
] as const;

const SET_PIECES: readonly { slot: GearSetSlot; name: string; symbol: string; kind: EquipmentBonusKind; priceFactor: number }[] = [
  { slot: 'head', name: 'Hood', symbol: 'HD', kind: 'luck', priceFactor: 1 },
  { slot: 'torso', name: 'Coat', symbol: 'CT', kind: 'xp', priceFactor: 1.25 },
  { slot: 'hands', name: 'Gloves', symbol: 'GL', kind: 'zone', priceFactor: 1.1 },
  { slot: 'feet', name: 'Boots', symbol: 'BT', kind: 'speed', priceFactor: 1 },
  { slot: 'jewelry', name: 'Charm', symbol: 'CH', kind: 'luck', priceFactor: 1.5 },
  { slot: 'utility', name: 'Creel', symbol: 'CR', kind: 'capacity', priceFactor: 1.3 },
];

function equipmentBonusLabel(kind: EquipmentBonusKind, amount: number): string {
  if (kind === 'xp') return `+${amount} XP per catch`;
  if (kind === 'capacity') return `+${amount} fish bag capacity`;
  if (kind === 'zone') return `+${Math.round(amount * 100)}% catch zone width`;
  if (kind === 'speed') return `+${Math.round(amount * 100)}% walking speed`;
  return `+${Math.round(amount * 100)}% Rare+ encounter weight`;
}

export const EQUIPMENT: readonly EquipmentDefinition[] = [
  { id: 'apprenticeHood', slot: 'head', name: 'Apprentice Hood', symbol: 'HD', description: 'A plain wool hood for cold mornings.', futureBonus: 'Luck' },
  { id: 'villagerTunic', slot: 'torso', name: 'Villager Tunic', symbol: 'TN', description: 'Simple green clothing for a new adventurer.', futureBonus: 'Fishing Power' },
  { id: 'workGloves', slot: 'hands', name: 'Work Gloves', symbol: 'GL', description: 'Sturdy gloves with reinforced palms.', futureBonus: 'Reel Control' },
  { id: 'leatherBoots', slot: 'feet', name: 'Leather Boots', symbol: 'BT', description: 'Well-worn boots made for village paths.', futureBonus: 'Move Speed' },
  { id: 'copperCharm', slot: 'jewelry', name: 'Copper Charm', symbol: 'CH', description: 'A humble charm on a braided cord.', futureBonus: 'Luck' },
  { id: 'smallCreel', slot: 'utility', name: 'Small Creel', symbol: 'CR', description: 'A woven hip basket for a fisher.', futureBonus: 'Bag Capacity' },
  { id: 'fisherHood', slot: 'head', name: 'Fisher Hood', symbol: 'FH', description: 'A hood stitched with lucky lake charms.', futureBonus: 'Luck', price: 90, bonusKind: 'luck', bonusAmount: 0.1, bonusLabel: '+10% Rare+ encounter weight' },
  { id: 'lakeVest', slot: 'torso', name: 'Lake Vest', symbol: 'LV', description: 'Pockets for every fishing tool.', futureBonus: 'Fishing Power', price: 120, bonusKind: 'xp', bonusAmount: 2, bonusLabel: '+2 XP per catch' },
  { id: 'gripGloves', slot: 'hands', name: 'Grip Gloves', symbol: 'GG', description: 'A firmer grip on the reel.', futureBonus: 'Reel Control', price: 140, bonusKind: 'zone', bonusAmount: 0.02, bonusLabel: '+2% catch zone width' },
  { id: 'marshBoots', slot: 'feet', name: 'Marsh Boots', symbol: 'MB', description: 'Light boots for long lakeside walks.', futureBonus: 'Move Speed', price: 110, bonusKind: 'speed', bonusAmount: 0.1, bonusLabel: '+10% walking speed' },
  { id: 'luckyPendant', slot: 'jewelry', name: 'Lucky Pendant', symbol: 'LP', description: 'A polished charm from Willow Lake.', futureBonus: 'Luck', price: 420, bonusKind: 'luck', bonusAmount: 0.2, bonusLabel: '+20% Rare+ encounter weight' },
  { id: 'riverRing', slot: 'ring', name: 'River Ring', symbol: 'RR', description: 'A simple copper ring with a blue stone.', futureBonus: 'Luck', price: 75, bonusKind: 'luck', bonusAmount: 0.1, bonusLabel: '+10% Rare+ encounter weight' },
  { id: 'pearlRing', slot: 'ring', name: 'Pearl Ring', symbol: 'PR', description: 'A bright pearl set in silver.', futureBonus: 'Luck', price: 1500, bonusKind: 'luck', bonusAmount: 0.4, bonusLabel: '+40% Rare+ encounter weight' },
  { id: 'deepCreel', slot: 'utility', name: 'Deep Creel', symbol: 'DC', description: 'A roomy basket for the catch.', futureBonus: 'Bag Capacity', price: 160, bonusKind: 'capacity', bonusAmount: 5, bonusLabel: '+5 fish bag capacity' },
  { id: 'tackleBox', slot: 'utility', name: 'Tackle Box', symbol: 'TB', description: 'A large organized fishing case.', futureBonus: 'Bag Capacity', price: 900, bonusKind: 'capacity', bonusAmount: 10, bonusLabel: '+10 fish bag capacity' },
  ...GEAR_SETS.flatMap((set) => SET_PIECES.map((piece) => {
    const amount = set.bonuses[piece.slot];
    return {
      id: `${set.id}${piece.slot[0]!.toUpperCase()}${piece.slot.slice(1)}` as EquipmentItemId,
      slot: piece.slot,
      name: `${set.name} ${piece.name}`,
      symbol: piece.symbol,
      description: `Part of the ${set.name} fishing set.`,
      futureBonus: piece.kind,
      price: Math.round(set.basePrice * piece.priceFactor),
      bonusKind: piece.kind,
      bonusAmount: amount,
      bonusLabel: equipmentBonusLabel(piece.kind, amount),
      setId: set.id,
      grade: set.grade,
    };
  })),
] as const;

export const RODS: readonly RodDefinition[] = [
  { id: 'starter', name: 'Old Bamboo Pole', description: 'A simple pole for the calmest shallows.', grade: 'Common', price: 0, zoneBonus: 0, cycleBonusMs: 0, escapeBonusMs: 0, xpBonus: 0 },
  { id: 'willow', name: 'Willow Rod', description: 'Reaches a little farther into the lake.', grade: 'Common', price: 35, zoneBonus: 0.01, cycleBonusMs: 30, escapeBonusMs: 100, xpBonus: 1 },
  { id: 'copper', name: 'Copperhook Rod', description: 'Its sturdier hook can land stronger pond fish.', grade: 'Common', price: 90, zoneBonus: 0.02, cycleBonusMs: 60, escapeBonusMs: 200, xpBonus: 2 },
  { id: 'reed', name: 'Green Reed Rod', description: 'Flexible enough to tempt fish beyond the shallows.', grade: 'Uncommon', price: 250, zoneBonus: 0.03, cycleBonusMs: 90, escapeBonusMs: 300, xpBonus: 3 },
  { id: 'oak', name: 'Oakheart Rod', description: 'A firm rod for the lake’s deeper, stronger fish.', grade: 'Uncommon', price: 600, zoneBonus: 0.04, cycleBonusMs: 120, escapeBonusMs: 400, xpBonus: 4 },
  { id: 'silver', name: 'Silverstream Rod', description: 'Sensitive line that can find elusive fish.', grade: 'Rare', price: 1300, zoneBonus: 0.05, cycleBonusMs: 150, escapeBonusMs: 500, xpBonus: 5 },
  { id: 'river', name: 'Riverglass Rod', description: 'Strong and precise enough for rare lake dwellers.', grade: 'Rare', price: 2500, zoneBonus: 0.06, cycleBonusMs: 180, escapeBonusMs: 600, xpBonus: 6 },
  { id: 'golden', name: 'Golden Tide Rod', description: 'Draws powerful fish from the deepest currents.', grade: 'Epic', price: 5000, zoneBonus: 0.07, cycleBonusMs: 210, escapeBonusMs: 700, xpBonus: 7 },
  { id: 'storm', name: 'Stormweaver Rod', description: 'Holds fast against extraordinary catches.', grade: 'Epic', price: 8000, zoneBonus: 0.08, cycleBonusMs: 240, escapeBonusMs: 800, xpBonus: 8 },
  { id: 'moon', name: 'Moonlit Rod', description: 'Moonlit line may lure the lake’s hidden wonders.', grade: 'Legendary', price: 14000, zoneBonus: 0.09, cycleBonusMs: 270, escapeBonusMs: 900, xpBonus: 9 },
  { id: 'celestial', name: 'Celestial Rod', description: 'The finest rod can reach even the lake’s most elusive legends.', grade: 'Legendary', price: 24000, zoneBonus: 0.10, cycleBonusMs: 300, escapeBonusMs: 1000, xpBonus: 10 },
] as const;

export const BAITS: readonly BaitDefinition[] = [
  { id: 'worms', name: 'Fresh Worms', price: 10, packSize: 5, minRarity: 'Uncommon', rarityMultiplier: 1.5 },
  { id: 'glowGrubs', name: 'Glow Grubs', price: 35, packSize: 5, minRarity: 'Rare', rarityMultiplier: 2 },
  { id: 'crimsonLarvae', name: 'Crimson Larvae', price: 65, packSize: 5, minRarity: 'Rare', rarityMultiplier: 2.5 },
  { id: 'moonMoths', name: 'Moon Moths', price: 100, packSize: 5, minRarity: 'Epic', rarityMultiplier: 3 },
  { id: 'starNectar', name: 'Star Nectar', price: 180, packSize: 5, minRarity: 'Legendary', rarityMultiplier: 4 },
] as const;

export function createDefaultSave(): GameSaveV1 {
  return {
    version: SAVE_VERSION,
    player: { ...MAPS.hub.spawn, level: 1, xp: 0 },
    fishing: { level: 1, xp: 0, autoEnabled: false },
    coins: 0,
    inventory: Object.fromEntries(FISH.map((fish) => [fish.id, 0])) as Record<FishId, number>,
    discoveredFish: [],
    inventoryCapacity: 20,
    unlockedBuildings: ['rodShop'],
    purchasedUpgrades: [],
    ownedEquipment: EQUIPMENT.filter((item) => !item.price).map((item) => item.id),
    equipment: { head: null, torso: 'villagerTunic', hands: null, feet: null, jewelry: null, ring: null, utility: null },
    ownedRods: ['starter'],
    equippedRod: 'starter',
    baitInventory: Object.fromEntries(BAITS.map((bait) => [bait.id, 0])) as Record<BaitId, number>,
    selectedBait: null,
    materials: { lakeIron: 0, riverCrystal: 0, starShard: 0 },
    enhancements: {},
    scene: 'village',
    location: 'hub',
    mapLayoutVersion: MAP_LAYOUT_VERSION,
  };
}

const finite = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function sanitizeSave(value: unknown): GameSaveV1 {
  const defaults = createDefaultSave();
  if (!value || typeof value !== 'object') return defaults;
  const raw = value as Record<string, unknown>;
  // Old saves used one shared world. Move them to the new hub once, keeping all progress.
  const migrateMap = raw.mapLayoutVersion !== MAP_LAYOUT_VERSION;
  const location: MapId = !migrateMap && raw.location === 'area1' ? 'area1' : 'hub';
  const map = MAPS[location];
  const player = raw.player && typeof raw.player === 'object' ? raw.player as Record<string, unknown> : {};
  const fishing = raw.fishing && typeof raw.fishing === 'object' ? raw.fishing as Record<string, unknown> : {};
  const inventory = raw.inventory && typeof raw.inventory === 'object' ? raw.inventory as Record<string, unknown> : {};
  const discoveredFish = FISH.filter((fish) =>
    (Array.isArray(raw.discoveredFish) && raw.discoveredFish.includes(fish.id))
    || finite(inventory[fish.id], 0) > 0,
  ).map((fish) => fish.id);
  const ownedEquipment = Array.isArray(raw.ownedEquipment)
    ? raw.ownedEquipment.filter((id): id is EquipmentItemId => EQUIPMENT.some((item) => item.id === id))
    : defaults.ownedEquipment;
  const rawEquipment = raw.equipment && typeof raw.equipment === 'object'
    ? raw.equipment as Record<string, unknown>
    : defaults.equipment;
  const migratedEquipment = { ...rawEquipment };
  if (migratedEquipment.jewelry === 'pearlRing' && !migratedEquipment.ring) {
    migratedEquipment.ring = 'pearlRing';
    migratedEquipment.jewelry = null;
  }
  const equipment = Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => {
    const id = migratedEquipment[slot];
    const valid = typeof id === 'string'
      && ownedEquipment.includes(id as EquipmentItemId)
      && EQUIPMENT.some((item) => item.id === id && item.slot === slot);
    return [slot, valid ? id : null];
  })) as Record<EquipmentSlot, EquipmentItemId | null>;
  const ownedRods: RodId[] = ['starter'];
  if (Array.isArray(raw.ownedRods)) for (const id of raw.ownedRods) {
    if (RODS.some((rod) => rod.id === id) && !ownedRods.includes(id as RodId)) ownedRods.push(id as RodId);
  }
  const equippedRod = ownedRods.includes(raw.equippedRod as RodId) ? raw.equippedRod as RodId : 'starter';
  const rawBait = raw.baitInventory && typeof raw.baitInventory === 'object'
    ? raw.baitInventory as Record<string, unknown> : {};
  const baitInventory = Object.fromEntries(BAITS.map((bait) =>
    [bait.id, Math.floor(finite(rawBait[bait.id], 0, 0, 9999))])) as Record<BaitId, number>;
  const selectedBait = BAITS.some((bait) => bait.id === raw.selectedBait && baitInventory[bait.id] > 0)
    ? raw.selectedBait as BaitId : null;
  const rawMaterials = raw.materials && typeof raw.materials === 'object' ? raw.materials as Record<string, unknown> : {};
  const materials = Object.fromEntries(MATERIALS.map((material) =>
    [material.id, Math.floor(finite(rawMaterials[material.id], 0, 0, 9999))])) as Record<MaterialId, number>;
  const rawEnhancements = raw.enhancements && typeof raw.enhancements === 'object'
    ? raw.enhancements as Record<string, unknown> : {};
  const enhancements = Object.fromEntries([...ownedRods, ...ownedEquipment].flatMap((id) => {
    const level = Math.floor(finite(rawEnhancements[id], 0, 0, MAX_ENHANCEMENT));
    return level > 0 ? [[id, level]] : [];
  })) as Partial<Record<EnhanceableId, number>>;

  return {
    version: SAVE_VERSION,
    player: {
      x: migrateMap ? map.spawn.x : finite(player.x, map.spawn.x, 49, map.width - 49),
      y: migrateMap ? map.spawn.y : finite(player.y, map.spawn.y, 49, map.height - 49),
      level: Math.floor(finite(player.level, 1, 1)),
      xp: Math.floor(finite(player.xp, 0)),
    },
    fishing: {
      level: Math.floor(finite(fishing.level, 1, 1)),
      xp: Math.floor(finite(fishing.xp, 0)),
      autoEnabled: location === 'area1' && raw.scene === 'fishing' && fishing.autoEnabled === true,
    },
    coins: Math.floor(finite(raw.coins, 0)),
    inventory: Object.fromEntries(FISH.map((fish) => [fish.id, Math.floor(finite(inventory[fish.id], 0))])) as Record<FishId, number>,
    discoveredFish,
    inventoryCapacity: Math.floor(finite(raw.inventoryCapacity, 20, 1, 9999)),
    unlockedBuildings: Array.isArray(raw.unlockedBuildings)
      ? raw.unlockedBuildings.filter((item): item is string => typeof item === 'string')
      : defaults.unlockedBuildings,
    purchasedUpgrades: Array.isArray(raw.purchasedUpgrades)
      ? raw.purchasedUpgrades.filter((item): item is string => typeof item === 'string')
      : [],
    ownedEquipment,
    equipment,
    ownedRods,
    equippedRod,
    baitInventory,
    selectedBait,
    materials,
    enhancements,
    scene: location === 'area1' && raw.scene === 'fishing' ? 'fishing' : 'village',
    location,
    mapLayoutVersion: MAP_LAYOUT_VERSION,
  };
}
