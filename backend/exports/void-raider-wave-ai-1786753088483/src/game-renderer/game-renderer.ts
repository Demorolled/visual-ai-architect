/**
 * Game Renderer — draws the game on a canvas from the Combat Engine's
 * GameState snapshot (data contract: Combat Engine → Game Renderer : data).
 */

import type { GameState } from '../combat-engine/combat-engine.ts';

const W = 800;
const H = 600;

export class GameRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is not available');
    this.ctx = ctx;
  }

  /** Attach the canvas to a container element. */
  mount(container: HTMLElement): void {
    container.appendChild(this.canvas);
  }

  /** Draw one frame. */
  render(state: GameState): void {
    const ctx = this.ctx;

    // Background.
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, W, H);

    // Player ship (triangle rotated to its heading).
    ctx.save();
    ctx.translate(state.player.x, state.player.y);
    ctx.rotate(state.player.angle);
    ctx.fillStyle = '#39ff88';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -11);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Enemies.
    for (const e of state.enemies) {
      ctx.fillStyle = e.hp > 1 ? '#ff5c5c' : '#ff9d5c';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b0f0f';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Projectiles.
    for (const p of state.projectiles) {
      ctx.fillStyle = p.owner === 'player' ? '#ffe14d' : '#ff6b6b';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillRect(-2, -6, 4, 12);
      ctx.restore();
    }

    // HUD.
    ctx.fillStyle = '#cfd8ff';
    ctx.font = '16px monospace';
    ctx.fillText(`SCORE ${state.score}`, 12, 24);
    ctx.fillText(`LIVES ${state.lives}`, 12, 46);
    ctx.fillText(`WAVE ${state.level}`, 12, 68);

    if (state.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ff5555';
      ctx.font = 'bold 42px monospace';
      ctx.fillText('GAME OVER', 240, 290);
      ctx.fillStyle = '#cfd8ff';
      ctx.font = '16px monospace';
      ctx.fillText(`Final score: ${state.score} — press R to restart`, 240, 330);
    }
  }
}
