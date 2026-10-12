/**
 * Combat Engine — simulation core of Void Raider.
 *
 * Owns the player ship, projectiles, collisions and scoring. It consumes
 * control requests (Ship Controls → Combat Engine) and enemy fleet data
 * (Enemy AI → Combat Engine), and emits a GameState snapshot every tick
 * (Combat Engine → Game Renderer).
 */

import type { EnemyAI, EnemyShip } from '../enemy-ai/enemy-ai.ts';
import type { ControlState } from '../ship-controls/ship-controls.ts';

export interface PlayerShip {
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: 'player' | 'enemy';
}

export interface GameState {
  player: PlayerShip;
  projectiles: Projectile[];
  enemies: EnemyShip[];
  score: number;
  level: number;
  lives: number;
  gameOver: boolean;
}

const WORLD_W = 800;
const WORLD_H = 600;
const FIRE_COOLDOWN_S = 0.28;
const PROJECTILE_SPEED = 420;
const PLAYER_TURN_RAD_S = 3.2;
const PLAYER_THRUST_PX_S = 260;

export class CombatEngine {
  private player: PlayerShip = { x: WORLD_W / 2, y: WORLD_H - 60, angle: -Math.PI / 2, hp: 100, maxHp: 100 };
  private projectiles: Projectile[] = [];
  private controls: ControlState = { thrust: false, turnLeft: false, turnRight: false, fire: false };
  private fireCooldown = 0;
  private score = 0;
  private level = 1;
  private lives = 3;
  private gameOver = false;

  constructor(
    private readonly ai: EnemyAI,
    private readonly onState: (state: GameState) => void,
  ) {}

  /** Requests come in from Ship Controls (data contract: requests). */
  handleRequest(action: string): void {
    if (action === 'fire') this.tryFire();
  }

  /** The controls layer pushes its live state each frame. */
  setControls(controls: ControlState): void {
    this.controls = controls;
  }

  /** Advance the simulation by dt seconds. */
  update(dt: number): void {
    if (this.gameOver) return;

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    // Player movement from control state.
    if (this.controls.turnLeft) this.player.angle -= PLAYER_TURN_RAD_S * dt;
    if (this.controls.turnRight) this.player.angle += PLAYER_TURN_RAD_S * dt;
    if (this.controls.thrust) {
      this.player.x += Math.cos(this.player.angle) * PLAYER_THRUST_PX_S * dt;
      this.player.y += Math.sin(this.player.angle) * PLAYER_THRUST_PX_S * dt;
    }
    this.player.x = Math.max(20, Math.min(WORLD_W - 20, this.player.x));
    this.player.y = Math.max(20, Math.min(WORLD_H - 20, this.player.y));
    if (this.controls.fire) this.tryFire();

    // Projectiles.
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.projectiles = this.projectiles.filter(
      (p) => p.x > -20 && p.x < WORLD_W + 20 && p.y > -20 && p.y < WORLD_H + 20,
    );

    // Player projectiles vs enemies.
    const enemies = this.ai.fleet();
    for (const p of this.projectiles) {
      if (p.owner !== 'player') continue;
      for (const e of enemies) {
        if (Math.abs(p.x - e.x) < 22 && Math.abs(p.y - e.y) < 22) {
          p.x = -999; // consumed this frame
          if (this.ai.takeHit(e.id, 1)) this.score += 100;
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.x > -500);

    // Enemies vs the player ship.
    for (const e of this.ai.fleet()) {
      if (Math.abs(e.x - this.player.x) < 24 && Math.abs(e.y - this.player.y) < 24) {
        this.player.hp -= 34;
        this.ai.takeHit(e.id, 999);
        if (this.player.hp <= 0) {
          this.lives -= 1;
          if (this.lives <= 0) {
            this.gameOver = true;
          } else {
            this.player.hp = 100;
            this.player.x = WORLD_W / 2;
            this.player.y = WORLD_H - 60;
          }
        }
      }
    }

    // Level tracking: advance when the field is clear (waves keep coming).
    if (this.ai.fleet().length === 0 && this.projectiles.length === 0) {
      this.level = Math.max(this.level, 1);
    }

    this.onState(this.getState());
  }

  private tryFire(): void {
    if (this.fireCooldown > 0) return;
    this.fireCooldown = FIRE_COOLDOWN_S;
    this.projectiles.push({
      x: this.player.x,
      y: this.player.y,
      vx: Math.cos(this.player.angle) * PROJECTILE_SPEED,
      vy: Math.sin(this.player.angle) * PROJECTILE_SPEED,
      owner: 'player',
    });
  }

  /** Current snapshot for the renderer (data contract: Combat Engine → Game Renderer). */
  getState(): GameState {
    return {
      player: { ...this.player },
      projectiles: [...this.projectiles],
      enemies: this.ai.fleet(),
      score: this.score,
      level: this.level,
      lives: this.lives,
      gameOver: this.gameOver,
    };
  }
}
