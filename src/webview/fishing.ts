export type FishingPhase = 'ready' | 'waiting' | 'bite' | 'caught' | 'missed';

export class FishingSession {
  phase: FishingPhase = 'ready';
  phaseStarted = 0;
  biteAt = 0;

  cast(now: number, random: () => number): boolean {
    if (this.phase !== 'ready' && this.phase !== 'caught' && this.phase !== 'missed') return false;
    this.phase = 'waiting';
    this.phaseStarted = now;
    this.biteAt = now + 2000 + random() * 3000;
    return true;
  }

  update(now: number): 'bite' | 'miss' | 'ready' | undefined {
    if (this.phase === 'waiting' && now >= this.biteAt) {
      this.phase = 'bite';
      this.phaseStarted = now;
      return 'bite';
    }
    if (this.phase === 'bite' && now - this.phaseStarted > 1200) {
      this.phase = 'missed';
      this.phaseStarted = now;
      return 'miss';
    }
    if ((this.phase === 'caught' || this.phase === 'missed') && now - this.phaseStarted > 750) {
      this.phase = 'ready';
      this.phaseStarted = now;
      return 'ready';
    }
    return undefined;
  }

  reel(now: number): boolean {
    if (this.phase !== 'bite') return false;
    this.phase = 'caught';
    this.phaseStarted = now;
    return true;
  }

  reset(): void {
    this.phase = 'ready';
    this.phaseStarted = 0;
    this.biteAt = 0;
  }
}
