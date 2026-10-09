import { distanceToRect, intersects, type Point, type Rect } from '../shared/rules.js';
import { MAPS, type MapId } from '../shared/model.js';

export interface Building extends Rect {
  id: string;
  name: string;
  color: string;
  locked: boolean;
}

export type WorldInteractionKind = 'lake' | 'fishGuide' | 'fishingPortal' | 'returnPortal' | 'rodShop' | 'equipmentShop' | 'blacksmith';

export const LAKE: Rect = { x: 340, y: 180, width: 520, height: 360 };
export const FISH_GUIDE_SIGN: Rect = { x: 750, y: 566, width: 110, height: 48 };
export const SAFE_SPAWN: Point = MAPS.hub.spawn;
export const AREA_ONE_SPAWN: Point = MAPS.area1.spawn;
export const FISHING_PORTAL: Rect = { x: 420, y: 200, width: 120, height: 70 };
export const RETURN_PORTAL: Rect = { x: 180, y: 650, width: 100, height: 70 };
export const PLAYER_RADIUS = 14;
export const BUILDINGS: readonly Building[] = [
  { id: 'rodShop', name: 'Fishing Supply Shop', x: 700, y: 360, width: 180, height: 140, color: '#507b83', locked: false },
  { id: 'equipmentShop', name: 'Equipment Shop', x: 80, y: 360, width: 180, height: 140, color: '#786c92', locked: false },
  { id: 'blacksmith', name: 'Blacksmith', x: 390, y: 610, width: 180, height: 120, color: '#89553e', locked: false },
] as const;

export const HUB_COLLIDERS: readonly Rect[] = BUILDINGS;
export const AREA_ONE_COLLIDERS: readonly Rect[] = [LAKE];

export function isPositionBlocked(position: Point, location: MapId = 'hub', radius = PLAYER_RADIUS): boolean {
  const map = MAPS[location];
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)
    || position.x < 35 + radius || position.y < 35 + radius
    || position.x > map.width - 35 - radius || position.y > map.height - 35 - radius) return true;
  const playerRect = { x: position.x - radius, y: position.y - radius, width: radius * 2, height: radius * 2 };
  const colliders = location === 'area1' ? AREA_ONE_COLLIDERS : HUB_COLLIDERS;
  return colliders.some((collider) => intersects(playerRect, collider));
}

export function ensureSafePosition(position: Point, location: MapId = 'hub'): Point {
  const fallback = location === 'area1' ? AREA_ONE_SPAWN : SAFE_SPAWN;
  return isPositionBlocked(position, location) ? { ...fallback } : { ...position };
}

export function movePlayer(position: Point, dx: number, dy: number, location: MapId = 'hub', radius = PLAYER_RADIUS): Point {
  const next = { ...position };
  const tryAxis = (axis: 'x' | 'y', amount: number): void => {
    next[axis] += amount;
    if (isPositionBlocked(next, location, radius)) next[axis] -= amount;
  };
  // Substeps prevent a delayed frame (or large move) tunnelling through solid map objects.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / radius));
  for (let step = 0; step < steps; step++) {
    tryAxis('x', dx / steps);
    tryAxis('y', dy / steps);
  }
  return next;
}

export function nearbyInteraction(position: Point, location: MapId = 'hub'): { kind: WorldInteractionKind; label: string } | undefined {
  if (location === 'area1') {
    if (distanceToRect(position, FISH_GUIDE_SIGN) <= 38) return { kind: 'fishGuide', label: 'E Read Fish Guide' };
    if (distanceToRect(position, LAKE) <= 38) return { kind: 'lake', label: 'Space Manual Fish  ·  E Inventory' };
    if (distanceToRect(position, RETURN_PORTAL) <= 42) return { kind: 'returnPortal', label: 'Step into portal to return to Village Hub' };
    return undefined;
  }
  if (distanceToRect(position, FISHING_PORTAL) <= 70) return { kind: 'fishingPortal', label: 'Step into portal to choose an area' };
  const rodShop = BUILDINGS.find((building) => building.id === 'rodShop');
  if (rodShop && distanceToRect(position, rodShop) <= 42) return { kind: 'rodShop', label: 'E Open Fishing Supply Shop' };
  const equipmentShop = BUILDINGS.find((building) => building.id === 'equipmentShop');
  if (equipmentShop && distanceToRect(position, equipmentShop) <= 42) return { kind: 'equipmentShop', label: 'E Open Equipment Shop' };
  const blacksmith = BUILDINGS.find((building) => building.id === 'blacksmith');
  if (blacksmith && distanceToRect(position, blacksmith) <= 42) return { kind: 'blacksmith', label: 'E Open Blacksmith' };
  return undefined;
}

export type PortalKind = 'fishingPortal' | 'returnPortal';
export function portalAt(position: Point, location: MapId): PortalKind | undefined {
  const portal = location === 'hub' ? FISHING_PORTAL : RETURN_PORTAL;
  return distanceToRect(position, portal) === 0
    ? location === 'hub' ? 'fishingPortal' : 'returnPortal'
    : undefined;
}

/** One activation per entry; dismissing the chooser does not immediately reopen it. */
export class PortalEntryTracker {
  private occupied: PortalKind | undefined;

  update(position: Point, location: MapId): PortalKind | undefined {
    const current = portalAt(position, location);
    const entered = current !== this.occupied ? current : undefined;
    this.occupied = current;
    return entered;
  }

  reset(): void { this.occupied = undefined; }
}
