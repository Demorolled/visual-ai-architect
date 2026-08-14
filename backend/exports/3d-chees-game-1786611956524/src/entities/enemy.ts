export class Enemy {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  target: { x: number; y: number };
  speed: number;

  constructor() {
    this.position = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    this.speed = 0.5;
  }

  update(playerPosition: { x: number; y: number }) {
    this.target = playerPosition;
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    this.velocity = { x: dx / distance * this.speed, y: dy / distance * this.speed };
    this.position.x += this.velocity.x;
    this.position.y += this.velocity.y;
  }

  render(canvasContext: CanvasRenderingContext2D) {
    canvasContext.fillStyle = 'red';
    canvasContext.fillRect(this.position.x, this.position.y, 20, 20);
  }
}