import { WorldState } from '../world-state/world-state.ts';

export class GameRenderer {
  private shipPath: number[][];
  private shipAngle: number;
  private shipScale: number;
  private shipThrottle: number;
  private asteroidCount: number;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.shipPath = [];
    this.shipAngle = 0;
    this.shipScale = 1;
    this.shipThrottle = 0;
    this.asteroidCount = 0;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  async init() {
    this.canvas.width = 800;
    this.canvas.height = 600;
    document.body.appendChild(this.canvas);
    this.shipPath = [[400, 300], [390, 310], [380, 320], [370, 330], [360, 340], [350, 350], [340, 360], [330, 370], [320, 380], [310, 390], [300, 400], [290, 410], [280, 420], [270, 430], [260, 440], [250, 450], [240, 460], [230, 470], [220, 480], [210, 490], [200, 500], [190, 510], [180, 520], [170, 530], [160, 540], [150, 550], [140, 560], [130, 570], [120, 580], [110, 590], [100, 600], [90, 590], [80, 580], [70, 570], [60, 560], [50, 550], [40, 540], [30, 530], [20, 520], [10, 510], [0, 500], [10, 490], [20, 480], [30, 470], [40, 460], [50, 450], [60, 440], [70, 430], [80, 420], [90, 410], [100, 400], [110, 390], [120, 380], [130, 370], [140, 360], [150, 350], [160, 340], [170, 330], [180, 320], [190, 310], [200, 300]];
    this.shipAngle = 0;
    this.shipScale = 1;
    this.shipThrottle = 0;
    this.asteroidCount = 0;
    this.render();
  }

  private render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.shipPath.forEach((p, i) => {
      if (i === 0) {
        this.ctx.moveTo(p[0], p[1]);
      } else {
        this.ctx.lineTo(p[0], p[1]);
      }
    });
    this.ctx.stroke();
    this.ctx.fillStyle = '#0f0';
    this.ctx.beginPath();
    this.ctx.arc(this.shipPath[this.shipPath.length - 1][0], this.shipPath[this.shipPath.length - 1][1], 10, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(this.shipPath[this.shipPath.length - 1][0], this.shipPath[this.shipPath.length - 1][1], 10, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '12px Arial';
    this.ctx.fillText('Asteroids: ' + this.asteroidCount, 10, 20);
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '12px Arial';
    this.ctx.fillText('Ship Path: ' + this.shipPath.length, 10, 35);
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '12px Arial';
    this.ctx.fillText('Ship Angle: ' + this.shipAngle, 10, 50);
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '12px Arial';
    this.ctx.fillText('Ship Scale: ' + this.shipScale, 10, 65);
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '12px Arial';
    this.ctx.fillText('Ship Throttle: ' + this.shipThrottle, 10, 80);
    this.renderAsteroids();
    this.renderProjectiles();
    this.renderExplosions();
    requestAnimationFrame(this.render.bind(this));
  }

  private renderAsteroids() {
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(400, 300, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(300, 200, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(500, 400, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(200, 100, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(600, 500, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(100, 500, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(700, 200, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(350, 450, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(450, 350, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(250, 250, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(550, 150, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(650, 300, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(150, 400, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(750, 450, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(300, 500, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(400, 100, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(200, 300, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(500, 200, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(350, 150, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(450, 400, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = '#f00';
    this.ctx.beginPath();
    this.ctx.arc(100, 300, 20, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private renderProjectiles() {
    this.ctx.fillStyle = '#ff0';
    const shots: number[][] = [
      [420, 280], [450, 260], [480, 240],
      [340, 320], [310, 340], [280, 360],
    ];
    for (const [x, y] of shots) {
      this.ctx.beginPath();
      this.ctx.arc(x, y, 4, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private renderExplosions() {
    this.ctx.fillStyle = '#ff8800';
    const blasts: number[][] = [
      [430, 310], [370, 260], [520, 420], [200, 250],
    ];
    for (const [x, y] of blasts) {
      this.ctx.beginPath();
      this.ctx.arc(x, y, 18, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}
