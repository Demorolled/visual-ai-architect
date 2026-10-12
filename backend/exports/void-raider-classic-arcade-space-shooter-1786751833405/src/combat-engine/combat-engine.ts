import { ShipPhysics } from '../ship-physics/ship-physics.ts';

export class CombatEngine {
  private ship: { position: { x: number; y: number }; velocity: { x: number; y: number }; angle: number; health: number; ammo: number };
  private target: { x: number; y: number };
  private firingTimer: number;
  private maxSpeed: number;
  private projectiles: { position: { x: number; y: number }; velocity: { x: number; y: number }; angle: number; damage: number }[];
  private waves: { position: { x: number; y: number }; velocity: { x: number; y: number }; angle: number; damage: number }[];

  constructor() {
    this.ship = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, angle: 0, health: 100, ammo: 10 };
    this.target = { x: 0, y: 0 };
    this.firingTimer = 0;
    this.maxSpeed = 5;
    this.projectiles = [];
    this.waves = [];
  }

  updateTarget(newTarget: { x: number; y: number }) {
    this.target = newTarget;
  }

  update(dt: number) {
    const targetAngle = Math.atan2(this.target.y - this.ship.position.y, this.target.x - this.ship.position.x);
    const angleDiff = targetAngle - this.ship.angle;
    this.ship.angle += angleDiff * 0.1;
    const speed = this.ship.velocity.x * Math.cos(this.ship.angle) + this.ship.velocity.y * Math.sin(this.ship.angle);
    if (speed > this.maxSpeed) {
      this.ship.velocity.x *= 0.95;
      this.ship.velocity.y *= 0.95;
    }
    this.ship.position.x += this.ship.velocity.x * dt;
    this.ship.position.y += this.ship.velocity.y * dt;
    this.firingTimer += dt;
  }

  fire() {
    if (this.firingTimer > 0.5) {
      this.firingTimer = 0;
      const projectile = { position: { x: this.ship.position.x, y: this.ship.position.y }, velocity: { x: this.ship.velocity.x * Math.cos(this.ship.angle) + 5 * Math.cos(this.ship.angle + Math.PI / 4), y: this.ship.velocity.y * Math.sin(this.ship.angle) + 5 * Math.sin(this.ship.angle + Math.PI / 4) }, angle: this.ship.angle, damage: 20 };
      this.projectiles.push(projectile);
    }
  }

  addWave(wave: { position: { x: number; y: number }; velocity: { x: number; y: number }; angle: number; damage: number }) {
    this.waves.push(wave);
  }

  checkCollisions() {
    for (const projectile of this.projectiles) {
      for (const wave of this.waves) {
        const distance = Math.sqrt(Math.pow(projectile.position.x - wave.position.x, 2) + Math.pow(projectile.position.y - wave.position.y, 2));
        if (distance < 10) {
          projectile.position.x = this.ship.position.x;
          projectile.position.y = this.ship.position.y;
          this.ship.health -= wave.damage;
          this.waves.splice(this.waves.indexOf(wave), 1);
          this.projectiles.splice(this.projectiles.indexOf(projectile), 1);
        }
      }
    }
  }
}