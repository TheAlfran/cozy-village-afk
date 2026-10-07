import { FISH, type FishDefinition, type FishId, type GameSaveV1 } from './model.js';

export function chooseFish(roll: number): FishDefinition {
  const normalized = Math.min(0.999999, Math.max(0, roll));
  let cursor = normalized * 100;
  for (const fish of FISH) {
    cursor -= fish.weight;
    if (cursor < 0) return fish;
  }
  return FISH[FISH.length - 1]!;
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

export function awardCatch(state: GameSaveV1, fish: FishDefinition): { stored: boolean; leveled: boolean } {
  const beforePlayer = state.player.level;
  const beforeFishing = state.fishing.level;
  const playerProgress = addXp(state.player.level, state.player.xp, fish.xp, (level) => 100 * level);
  const fishingProgress = addXp(state.fishing.level, state.fishing.xp, fish.xp, (level) => 75 * level);
  Object.assign(state.player, playerProgress);
  Object.assign(state.fishing, fishingProgress);
  state.coins += 1;
  const stored = inventoryCount(state) < state.inventoryCapacity;
  if (stored) state.inventory[fish.id] += 1;
  return { stored, leveled: beforePlayer !== state.player.level || beforeFishing !== state.fishing.level };
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
