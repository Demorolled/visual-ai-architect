export class ShipControls {
  private ship: { position: { x: number; y: number }; velocity: { x: number; y: number }; angle: number; health: number; ammo: number };
  private target: { x: number; y: number };
  private firingTimer: number;
  private maxSpeed: number;

  constructor() {
    this.ship = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, angle: 0, health: 100, ammo: 10 };
    this.target = { x: 0, y: 0 };
    this.firingTimer = 0;
    this.maxSpeed = 5;
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
      return projectile;
    }
  }

  hit() {
    this.ship.health -= 10;
    if (this.ship.health <= 0) {
      this.ship.position.x = 0;
      this.ship.position.y = 0;
      this.ship.velocity.x = 0;
      this.ship.velocity.y = 0;
      this.ship.angle = 0;
      this.ship.health = 100;
      this.ship.ammo = 10;
    }
  }
}