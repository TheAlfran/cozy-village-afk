import { distanceToRect, intersects, type Point, type Rect } from '../shared/rules.js';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../shared/model.js';

export interface Building extends Rect {
  id: string;
  name: string;
  color: string;
  locked: boolean;
}

export const LAKE: Rect = { x: 850, y: 390, width: 440, height: 310 };
export const SAFE_SPAWN: Point = { x: 320, y: 700 };
export const PLAYER_RADIUS = 14;
export const BUILDINGS: readonly Building[] = [
  { id: 'market', name: 'Riverside Market', x: 170, y: 190, width: 190, height: 125, color: '#d98f4e', locked: false },
  { id: 'home', name: 'Player House', x: 560, y: 120, width: 180, height: 120, color: '#b87952', locked: true },
  { id: 'tavern', name: 'Tavern', x: 1480, y: 170, width: 200, height: 130, color: '#8f6248', locked: true },
  { id: 'fishShop', name: 'Fishing Shop', x: 1960, y: 250, width: 210, height: 125, color: '#507b83', locked: true },
  { id: 'smith', name: 'Blacksmith', x: 1110, y: 990, width: 190, height: 130, color: '#6d7180', locked: true },
  { id: 'farm', name: 'Farm', x: 1770, y: 1030, width: 240, height: 145, color: '#a37842', locked: true },
  { id: 'training', name: 'Training Grounds', x: 420, y: 1080, width: 230, height: 130, color: '#777b56', locked: true },
] as const;

const TREE_BLOCKS: readonly Rect[] = [
  { x: 0, y: 0, width: 35, height: WORLD_HEIGHT },
  { x: WORLD_WIDTH - 35, y: 0, width: 35, height: WORLD_HEIGHT },
  { x: 0, y: 0, width: WORLD_WIDTH, height: 35 },
  { x: 0, y: WORLD_HEIGHT - 35, width: WORLD_WIDTH, height: 35 },
];

export const COLLIDERS: readonly Rect[] = [...BUILDINGS, LAKE, ...TREE_BLOCKS];

export function isPositionBlocked(position: Point, radius = PLAYER_RADIUS): boolean {
  const playerRect = { x: position.x - radius, y: position.y - radius, width: radius * 2, height: radius * 2 };
  return COLLIDERS.some((collider) => intersects(playerRect, collider));
}

export function ensureSafePosition(position: Point): Point {
  return isPositionBlocked(position) ? { ...SAFE_SPAWN } : { ...position };
}

export function movePlayer(position: Point, dx: number, dy: number, radius = PLAYER_RADIUS): Point {
  const next = { ...position };
  const tryAxis = (axis: 'x' | 'y', amount: number): void => {
    next[axis] += amount;
    if (isPositionBlocked(next, radius)) next[axis] -= amount;
  };
  tryAxis('x', dx);
  tryAxis('y', dy);
  return next;
}

export function nearbyInteraction(position: Point): { kind: 'lake' | 'market' | 'locked'; label: string } | undefined {
  if (distanceToRect(position, LAKE) <= 38) return { kind: 'lake', label: 'Press E to Fish' };
  for (const building of BUILDINGS) {
    if (distanceToRect(position, building) <= 42) {
      if (building.id === 'market') return { kind: 'market', label: 'Press E to Enter Market' };
      return { kind: 'locked', label: `${building.name} is locked` };
    }
  }
  return undefined;
}
