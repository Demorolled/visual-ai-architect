import { CombatEngine } from '../combat-engine/combat-engine.ts';

export class WorldState {
  private ship: { position: { x: number; y: number }; health: number; shield: number; velocity: { x: number; y: number } };
  private projectiles: { position: { x: number; y: number }; velocity: { x: number; y: number }; damage: number; isExpired: boolean }[];
  private asteroids: { position: { x: number; y: number }; size: number; health: number; isExploding: boolean; velocity: { x: number; y: number } }[];
  private waves: { ships: { position: { x: number; y: number }; health: number; shield: number; velocity: { x: number; y: number } }[]; score: number; difficulty: number }[];
  private cooldown: number;
  private gameRunning: boolean;
  private gameScore: number;
  private gameLives: number;
  private gameLevel: number;

  constructor() {
    this.ship = { position: { x: 0, y: 0 }, health: 100, shield: 50, velocity: { x: 0, y: 0 } };
    this.projectiles = [];
    this.asteroids = [];
    this.waves = [];
    this.cooldown = 0;
    this.gameRunning = true;
    this.gameScore = 0;
    this.gameLives = 3;
    this.gameLevel = 1;
  }

  update(): void {
    if (!this.gameRunning) return;
    this.ship.position.x += this.ship.velocity.x;
    this.ship.position.y += this.ship.velocity.y;

    for (const projectile of this.projectiles) {
      projectile.position.x += projectile.velocity.x;
      projectile.position.y += projectile.velocity.y;
      if (projectile.isExpired) this.projectiles.splice(this.projectiles.indexOf(projectile), 1);
    }

    for (const asteroid of this.asteroids) {
      asteroid.position.x += asteroid.velocity.x;
      asteroid.position.y += asteroid.velocity.y;
      if (asteroid.position.x < -100 || asteroid.position.x > 800 || asteroid.position.y < -100 || asteroid.position.y > 600) {
        this.asteroids.splice(this.asteroids.indexOf(asteroid), 1);
        continue;
      }
      if (asteroid.isExploding) {
        asteroid.health--;
        if (asteroid.health <= 0) {
          this.asteroids.splice(this.asteroids.indexOf(asteroid), 1);
          this.gameScore += 10;
          continue;
        }
        continue;
      }
      if (this.ship.position.x + 20 > asteroid.position.x && this.ship.position.x - 20 < asteroid.position.x && this.ship.position.y + 20 > asteroid.position.y && this.ship.position.y - 20 < asteroid.position.y) {
        this.ship.health -= 20;
        this.asteroids.splice(this.asteroids.indexOf(asteroid), 1);
        this.gameScore += 5;
        continue;
      }
    }

    for (const wave of this.waves) {
    }
  }

  fire(): void {
    if (this.cooldown > 0) return;
    const projectile = { position: { x: this.ship.position.x, y: this.ship.position.y }, velocity: { x: 0, y: -10 }, damage: 20, isExpired: false };
    this.projectiles.push(projectile);
    this.cooldown = 10;
  }

  addWave(wave: { ships: { position: { x: number; y: number }; health: number; shield: number; velocity: { x: number; y: number } }[]; score: number; difficulty: number }): void {
    this.waves.push(wave);
  }

  getGameState(): { ship: { position: { x: number; y: number }; health: number; shield: number; velocity: { x: number; y: number } }; projectiles: { position: { x: number; y: number }; velocity: { x: number; y: number }; damage: number; isExpired: boolean }[]; asteroids: { position: { x: number; y: number }; size: number; health: number; isExploding: boolean; velocity: { x: number; y: number } }[]; waves: { ships: { position: { x: number; y: number }; health: number; shield: number; velocity: { x: number; y: number } }[]; score: number; difficulty: number }[]; cooldown: number; gameRunning: boolean; gameScore: number; gameLives: number; gameLevel: number } {
    return {
      ship: this.ship,
      projectiles: this.projectiles,
      asteroids: this.asteroids,
      waves: this.waves,
      cooldown: this.cooldown,
      gameRunning: this.gameRunning,
      gameScore: this.gameScore,
      gameLives: this.gameLives,
      gameLevel: this.gameLevel
    };
  }

  setGameState(state: { ship: { position: { x: number; y: number }; health: number; shield: number; velocity: { x: number; y: number } }; projectiles: { position: { x: number; y: number }; velocity: { x: number; y: number }; damage: number; isExpired: boolean }[]; asteroids: { position: { x: number; y: number }; size: number; health: number; isExploding: boolean; velocity: { x: number; y: number } }[]; waves: { ships: { position: { x: number; y: number }; health: number; shield: number; velocity: { x: number; y: number } }[]; score: number; difficulty: number }[]; cooldown: number; gameRunning: boolean; gameScore: number; gameLives: number; gameLevel: number }): void {
    this.ship = state.ship;
    this.projectiles = state.projectiles;
    this.asteroids = state.asteroids;
    this.waves = state.waves;
    this.cooldown = state.cooldown;
    this.gameRunning = state.gameRunning;
    this.gameScore = state.gameScore;
    this.gameLives = state.gameLives;
    this.gameLevel = state.gameLevel;
  }
}