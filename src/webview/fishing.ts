import type { Rarity } from '../shared/model.js';

export type FishingPhase = 'ready' | 'waiting' | 'bite' | 'caught' | 'missed';

const CATCH_ZONE_BY_RARITY: Record<Rarity, number> = {
  Common: 0.34,
  Uncommon: 0.26,
  Rare: 0.17,
  Epic: 0.11,
  Legendary: 0.07,
};

const MARKER_CYCLE_BY_RARITY: Record<Rarity, number> = {
  Common: 2600,
  Uncommon: 2200,
  Rare: 1600,
  Epic: 1200,
  Legendary: 900,
};

const ESCAPE_WINDOW_BY_RARITY: Record<Rarity, number> = {
  Common: 6500,
  Uncommon: 5200,
  Rare: 3600,
  Epic: 2600,
  Legendary: 1900,
};

export function catchZoneWidth(rarity: Rarity): number {
  return CATCH_ZONE_BY_RARITY[rarity];
}

export function markerCycleMs(rarity: Rarity): number {
  return MARKER_CYCLE_BY_RARITY[rarity];
}

export function escapeWindowMs(rarity: Rarity): number {
  return ESCAPE_WINDOW_BY_RARITY[rarity];
}

export class FishingSession {
  phase: FishingPhase = 'ready';
  phaseStarted = 0;
  targetCenter = 0.5;
  targetWidth = catchZoneWidth('Common');
  markerCycleMs = markerCycleMs('Common');
  escapeAfterMs = escapeWindowMs('Common');

  cast(
    now: number,
    random: () => number,
    targetWidth = catchZoneWidth('Common'),
    markerCycle = markerCycleMs('Common'),
    escapeAfter = escapeWindowMs('Common'),
  ): boolean {
    if (this.phase !== 'ready' && this.phase !== 'caught' && this.phase !== 'missed') return false;
    this.phase = 'waiting';
    this.phaseStarted = now;
    this.targetWidth = Math.min(0.4, Math.max(0.06, targetWidth));
    this.markerCycleMs = Math.min(3000, Math.max(700, markerCycle));
    this.escapeAfterMs = Math.min(8000, Math.max(1200, escapeAfter));
    // Keep the whole target zone inside the meter, including a small edge margin.
    const edge = this.targetWidth / 2 + 0.025;
    this.targetCenter = edge + Math.min(1, Math.max(0, random())) * (1 - edge * 2);
    return true;
  }

  update(now: number): 'escape' | 'ready' | undefined {
    if (this.phase === 'waiting' && now - this.phaseStarted >= this.escapeAfterMs) {
      this.phase = 'missed';
      this.phaseStarted = now;
      return 'escape';
    }
    if ((this.phase === 'caught' || this.phase === 'missed') && now - this.phaseStarted > 750) {
      this.phase = 'ready';
      this.phaseStarted = now;
      return 'ready';
    }
    return undefined;
  }

  markerPosition(now: number): number {
    if (this.phase !== 'waiting') return 0;
    const cycle = ((now - this.phaseStarted) % this.markerCycleMs) / this.markerCycleMs;
    return cycle <= 0.5 ? cycle * 2 : (1 - cycle) * 2;
  }

  reel(now: number): boolean {
    if (this.phase !== 'waiting') return false;
    const caught = Math.abs(this.markerPosition(now) - this.targetCenter) <= this.targetWidth / 2;
    this.phase = caught ? 'caught' : 'missed';
    this.phaseStarted = now;
    return caught;
  }

  reset(): void {
    this.phase = 'ready';
    this.phaseStarted = 0;
    this.targetCenter = 0.5;
    this.targetWidth = catchZoneWidth('Common');
    this.markerCycleMs = markerCycleMs('Common');
    this.escapeAfterMs = escapeWindowMs('Common');
  }
}
