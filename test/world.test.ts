import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/shared/model.js';
import { SAFE_SPAWN, AREA_ONE_SPAWN, BUILDINGS, FISHING_PORTAL, RETURN_PORTAL, PortalEntryTracker, portalAt, ensureSafePosition, isPositionBlocked, movePlayer, nearbyInteraction } from '../src/webview/world.js';

describe('village world', () => {
  it('blocks movement through a building and permits open ground', () => {
    expect(movePlayer({ x: 680, y: 430 }, 250, 0).x).toBeLessThan(700);
    expect(movePlayer(SAFE_SPAWN, 10, 0).x).toBe(SAFE_SPAWN.x + 10);
  });

  it('repairs a saved position that is inside a building', () => {
    expect(isPositionBlocked({ x: 720, y: 430 })).toBe(true);
    expect(isPositionBlocked(SAFE_SPAWN)).toBe(false);
    expect(ensureSafePosition({ x: 720, y: 430 })).toEqual(SAFE_SPAWN);
    expect(ensureSafePosition({ x: 1750, y: 780 })).toEqual(SAFE_SPAWN);
    expect(ensureSafePosition(SAFE_SPAWN)).toEqual(SAFE_SPAWN);
  });

  it('detects the lake, fishing portals, and all three village shops', () => {
    expect(nearbyInteraction(AREA_ONE_SPAWN, 'area1')?.kind).toBe('lake');
    expect(nearbyInteraction({ x: 800, y: 635 }, 'area1')?.kind).toBe('fishGuide');
    expect(nearbyInteraction({ x: 480, y: 290 })?.kind).toBe('fishingPortal');
    expect(nearbyInteraction({ x: 230, y: 730 }, 'area1')?.kind).toBe('returnPortal');
    expect(nearbyInteraction({ x: 790, y: 530 })?.kind).toBe('rodShop');
    expect(nearbyInteraction({ x: 170, y: 530 })?.kind).toBe('equipmentShop');
    expect(nearbyInteraction({ x: 480, y: 575 })?.kind).toBe('blacksmith');
    expect(nearbyInteraction(AREA_ONE_SPAWN, 'hub')).toBeUndefined();
  });

  it('places the blacksmith near the hub without blocking spawn or other shops', () => {
    const blacksmith = BUILDINGS.find((building) => building.id === 'blacksmith')!;
    expect(blacksmith.locked).toBe(false);
    expect(isPositionBlocked(SAFE_SPAWN)).toBe(false);
    expect(isPositionBlocked({ x: blacksmith.x + 90, y: blacksmith.y + 60 })).toBe(true);
    expect(movePlayer(SAFE_SPAWN, 0, 75)).toEqual({ x: SAFE_SPAWN.x, y: SAFE_SPAWN.y + 75 });
  });

  it('has independent boundaries and lake collisions', () => {
    expect(MAPS.hub.width).toBeLessThan(MAPS.area1.width);
    expect(isPositionBlocked({ x: 390, y: 230 }, 'hub')).toBe(false);
    expect(isPositionBlocked({ x: 390, y: 230 }, 'area1')).toBe(true);
    expect(movePlayer(AREA_ONE_SPAWN, 0, -500, 'area1').y).toBeGreaterThanOrEqual(554);
    for (const location of ['hub', 'area1'] as const) {
      expect(isPositionBlocked(MAPS[location].spawn, location)).toBe(false);
      expect(portalAt(MAPS[location].spawn, location)).toBeUndefined();
      const next = movePlayer(MAPS[location].spawn, 5000, 5000, location);
      expect(isPositionBlocked(next, location)).toBe(false);
      expect(next.x).toBeLessThanOrEqual(MAPS[location].width - 49);
      expect(next.y).toBeLessThanOrEqual(MAPS[location].height - 49);
      expect(isPositionBlocked({ x: -100, y: 300 }, location)).toBe(true);
    }
  });

  it('activates once per portal entry and supports repeated round trips', () => {
    const entries = new PortalEntryTracker();
    const hubPortal = { x: FISHING_PORTAL.x + 60, y: FISHING_PORTAL.y + 35 };
    const returnPortal = { x: RETURN_PORTAL.x + 50, y: RETURN_PORTAL.y + 35 };
    expect(portalAt(returnPortal, 'hub')).toBeUndefined();
    expect(portalAt(hubPortal, 'area1')).toBeUndefined();
    for (let round = 0; round < 3; round++) {
      entries.reset();
      expect(entries.update(hubPortal, 'hub')).toBe('fishingPortal');
      expect(entries.update(hubPortal, 'hub')).toBeUndefined();
      expect(entries.update(SAFE_SPAWN, 'hub')).toBeUndefined();
      expect(entries.update(hubPortal, 'hub')).toBe('fishingPortal');
      entries.reset();
      expect(entries.update(AREA_ONE_SPAWN, 'area1')).toBeUndefined();
      expect(entries.update(returnPortal, 'area1')).toBe('returnPortal');
    }
  });
});
