export class Scene {
  private entities: { update: (dt: number) => void; render: () => void }[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = 800;
    this.canvas.height = 600;
  }

  addEntity(entity: { update: (dt: number) => void; render: () => void }) {
    this.entities.push(entity);
  }

  update(dt: number) {
    this.entities.forEach((e) => e.update(dt));
  }

  render() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.entities.forEach((e) => e.render());
  }
}