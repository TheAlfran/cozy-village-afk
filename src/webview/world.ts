import { distanceToRect, intersects, type Point, type Rect } from '../shared/rules.js';

export interface Building extends Rect {
  id: string;
  name: string;
  color: string;
  locked: boolean;
}

export const LAKE: Rect = { x: 350, y: 160, width: 260, height: 180 };
export const BUILDINGS: readonly Building[] = [
  { id: 'market', name: 'Market', x: 70, y: 65, width: 170, height: 115, color: '#d98f4e', locked: false },
  { id: 'home', name: 'Player House', x: 710, y: 70, width: 155, height: 105, color: '#b87952', locked: true },
  { id: 'tavern', name: 'Tavern', x: 720, y: 365, width: 170, height: 110, color: '#8f6248', locked: true },
  { id: 'smith', name: 'Blacksmith', x: 85, y: 355, width: 160, height: 110, color: '#6d7180', locked: true },
] as const;

const TREE_BLOCKS: readonly Rect[] = [
  { x: 0, y: 0, width: 35, height: 540 },
  { x: 925, y: 0, width: 35, height: 540 },
  { x: 0, y: 0, width: 960, height: 28 },
  { x: 0, y: 512, width: 960, height: 28 },
];

export const COLLIDERS: readonly Rect[] = [...BUILDINGS, LAKE, ...TREE_BLOCKS];

export function movePlayer(position: Point, dx: number, dy: number, radius = 14): Point {
  const next = { ...position };
  const tryAxis = (axis: 'x' | 'y', amount: number): void => {
    next[axis] += amount;
    const playerRect = { x: next.x - radius, y: next.y - radius, width: radius * 2, height: radius * 2 };
    if (COLLIDERS.some((collider) => intersects(playerRect, collider))) next[axis] -= amount;
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
