/**
 * Enemy AI — owns the enemy fleet's lifecycle.
 *
 * Consumes WaveManager's state_and_events, materializes each wave into live
 * EnemyShip objects, and advances them every tick. The Combat Engine reads the
 * fleet (data contract: Enemy AI → Combat Engine) and reports hits back via
 * takeHit().
 */

import type { WaveEvent } from '../wave-manager/wave-manager.ts';

export interface EnemyShip {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}

const WORLD_BOTTOM = 690;
const WORLD_LEFT = 40;
const WORLD_RIGHT = 760;

export class EnemyAI {
  private enemies: EnemyShip[] = [];

  constructor(private readonly onFleetChange: (fleet: EnemyShip[]) => void) {}

  /** Handle a wave event from the Wave Manager. */
  handleWaveEvent(event: WaveEvent): void {
    if (event.type === 'wave-start') {
      this.enemies = event.enemies.map((e) => ({
        id: e.id,
        x: e.x,
        y: e.y,
        vx: 0,
        vy: e.speed,
        hp: e.hp,
        maxHp: e.hp,
        alive: true,
      }));
    } else {
      // wave-end: drop stragglers that drifted off-screen; survivors persist.
      this.enemies = this.enemies.filter((e) => e.alive && e.y < WORLD_BOTTOM);
    }
    this.emitFleet();
  }

  /** Advance the fleet by dt seconds. */
  update(dt: number): void {
    let changed = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.y > WORLD_BOTTOM) {
        // Re-enter from the top at a random column (endless arcade drift).
        e.y = -40;
        e.x = WORLD_LEFT + Math.random() * (WORLD_RIGHT - WORLD_LEFT);
      }
      changed = true;
    }
    if (changed) this.emitFleet();
  }

  /** Apply damage to an enemy. Returns true when the enemy was destroyed. */
  takeHit(id: number, damage: number): boolean {
    const enemy = this.enemies.find((e) => e.id === id);
    if (!enemy || !enemy.alive) return false;
    enemy.hp -= damage;
    if (enemy.hp <= 0) {
      enemy.alive = false;
      this.emitFleet();
      return true;
    }
    this.emitFleet();
    return false;
  }

  /** Live enemies (data contract: Enemy AI → Combat Engine). */
  fleet(): EnemyShip[] {
    return this.enemies.filter((e) => e.alive);
  }

  private emitFleet(): void {
    this.onFleetChange(this.fleet());
  }
}
