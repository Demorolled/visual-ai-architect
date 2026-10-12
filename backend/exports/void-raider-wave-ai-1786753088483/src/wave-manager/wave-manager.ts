/**
 * Wave Manager — owns the wave schedule for Void Raider.
 *
 * Emits a WaveEvent (state_and_events contract: Wave Manager → Enemy AI) for
 * each wave: `wave-start` with the spawn list, then `wave-end` after the
 * wave's runtime elapses. Waves escalate (more enemies, faster, tougher) as
 * the level rises.
 */

export interface WaveEnemySpec {
  id: number;
  x: number;
  y: number;
  speed: number;
  hp: number;
}

export interface WaveEvent {
  type: 'wave-start' | 'wave-end';
  level: number;
  enemies: WaveEnemySpec[];
}

const CANVAS_WIDTH = 800;

export class WaveManager {
  private level = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly emitter: (event: WaveEvent) => void) {}

  /** Begin the wave cycle. Safe to call again after stop(). */
  start(): void {
    this.scheduleNextWave();
  }

  /** Stop the wave cycle (used when the game ends). */
  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getLevel(): number {
    return this.level;
  }

  private scheduleNextWave(): void {
    this.level += 1;
    const enemies: WaveEnemySpec[] = this.buildWave(this.level);

    this.emitter({ type: 'wave-start', level: this.level, enemies });

    this.timer = setTimeout(() => {
      this.emitter({ type: 'wave-end', level: this.level, enemies });
      // Waves keep coming until the game stops the manager.
      this.scheduleNextWave();
    }, 18_000);
  }

  private buildWave(level: number): WaveEnemySpec[] {
    const count = Math.min(3 + level * 2, 24);
    const speed = 40 + level * 12;
    const hp = 2 + Math.floor(level / 2);
    const cols = 8;
    const gapX = Math.floor((CANVAS_WIDTH - 120) / cols);
    const out: WaveEnemySpec[] = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols);
      out.push({
        id: i + 1,
        x: 60 + (i % cols) * gapX,
        y: -40 - row * 60,
        speed,
        hp,
      });
    }
    return out;
  }
}
