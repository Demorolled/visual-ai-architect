export class Grid {
  private cells: boolean[][];
  private rows: number;
  private cols: number;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.cells = Array.from({ length: rows }, () => new Array(cols).fill(false));
  }

  updateCell(row: number, col: number, alive: boolean) {
    this.cells[row][col] = alive;
  }

  getCell(row: number, col: number): boolean {
    return this.cells[row][col];
  }

  draw(context: CanvasRenderingContext2D) {
    const cellWidth = 10;
    const cellHeight = 10;
    context.clearRect(0, 0, this.cols * cellWidth, this.rows * cellHeight);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.getCell(r, c)) {
          context.fillRect(c * cellWidth, r * cellHeight, cellWidth, cellHeight);
        }
      }
    }
  }

  neighbors(row: number, col: number): number {
    let alive = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = (row + dr + this.rows) % this.rows;
        const nc = (col + dc + this.cols) % this.cols;
        alive += this.getCell(nr, nc) ? 1 : 0;
      }
    }
    return alive;
  }

  tick() {
    const next = Array.from({ length: this.rows }, () => new Array(this.cols).fill(false));
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const alive = this.getCell(r, c);
        const n = this.neighbors(r, c);
        if (alive && (n < 2 || n > 3)) next[r][c] = false;
        else if (!alive && n === 3) next[r][c] = true;
      }
    }
    this.cells = next;
  }

  get aliveCells() {
    return this.cells.flat().filter(Boolean).length;
  }
}