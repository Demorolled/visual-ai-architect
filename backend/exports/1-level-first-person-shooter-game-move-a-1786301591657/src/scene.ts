export class CollisionDetector {
  private static pointsInLine(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const dy = p2.y - p1.y;
    const dx = p2.x - p1.x;
    const slope = dx === 0 ? Number.MAX_SAFE_INTEGER : dy / dx;
    return { vertical: dx === 0, slope, intercept: p1.y - (slope * p1.x) };
  }
  private static lineIntersection(p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }, p4: { x: number; y: number }) {
    const { vertical: vertical1, slope: slope1, intercept: intercept1 } = this.pointsInLine(p1, p2);
    const { vertical: vertical2, slope: slope2, intercept: intercept2 } = this.pointsInLine(p3, p4);
    if (vertical1 && vertical2) return { x: p1.x, y: 0 };
    if (slope1 === slope2) return { x: 0, y: 0 };
    const x = (intercept2 - intercept1) / (slope1 - slope2);
    const y = (slope1 * x) + intercept1;
    return { x, y };
  }
  private static pointOnSegment(p: { x: number; y: number }, s1: { x: number; y: number }, s2: { x: number; y: number }) {
    const dx = s2.x - s1.x;
    const dy = s2.y - s1.y;
    const dp = { x: p.x - s1.x, y: p.y - s1.y };
    const dot = dp.x * dx + dp.y * dy;
    const len2 = dx * dx + dy * dy;
    const param = dot / len2;
    return param >= 0 && param <= 1;
  }
  private static segmentIntersection(s1: { x1: number; y1: number; x2: number; y2: number }, s2: { x1: number; y1: number; x2: number; y2: number }) {
    const { x, y } = this.lineIntersection({ x: s1.x1, y: s1.y1 }, { x: s1.x2, y: s1.y2 }, { x: s2.x1, y: s2.y1 }, { x: s2.x2, y: s2.y2 });
    return this.pointOnSegment({ x, y }, { x: s1.x1, y: s1.y1 }, { x: s1.x2, y: s1.y2 }) && this.pointOnSegment({ x, y }, { x: s2.x1, y: s2.y1 }, { x: s2.x2, y: s2.y2 });
  }
  public static isColliding(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }
  public static isSegmentColliding(a: { x1: number; y1: number; x2: number; y2: number }, b: { x1: number; y1: number; x2: number; y2: number }) {
    return this.segmentIntersection(a, b);
  }
}
export class SceneRenderer {
  private canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }
  private drawGrid() {
    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = '#444';
      for (let x = 0; x <= this.canvas.width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= this.canvas.height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.canvas.width, y);
        ctx.stroke();
      }
    }
  }
  private drawPlayer(player: { x: number; y: number; width: number; height: number }) {
    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(player.x, player.y, 16, 16);
    }
  }
  public render(player: { x: number; y: number; width: number; height: number }) {
    this.drawGrid();
    this.drawPlayer(player);
  }
}