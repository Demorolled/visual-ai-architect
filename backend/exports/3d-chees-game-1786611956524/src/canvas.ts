export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function render(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, state: { player: { x: number; y: number }; enemies: { x: number; y: number }[]; cheese: { x: number; y: number } }) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(state.cheese.x, state.cheese.y, 10, 0, Math.PI * 2);
  ctx.fill();
  state.enemies.forEach((enemy) => {
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, 10, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, 10, 0, Math.PI * 2);
  ctx.fill();
}