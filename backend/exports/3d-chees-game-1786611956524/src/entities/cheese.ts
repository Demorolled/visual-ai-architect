export class Cheese {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  constructor(x: number, y: number, z: number) {
    this.position = { x, y, z };
    this.velocity = { x: 0, y: 0, z: 0 };
  }
  update(dt: number) {
    this.velocity.y -= 0.05 * dt;
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;
  }
  render(renderer: any) {
    renderer.renderCheese(this.position);
  }
}