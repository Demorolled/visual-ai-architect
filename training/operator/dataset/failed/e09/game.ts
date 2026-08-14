export class Game {
  private grid: boolean[][];
  private rows: number;
  private cols: number;
  private nextGen: boolean[][];
  private generation: number;

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.grid = Array.from({ length: rows }, () => Array(cols).fill(false));
    this.nextGen = [];
    this.generation = 0;
  }

  private updateGrid() {
    this.nextGen = this.grid.map((row) => [...row]);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const alive = this.grid[y][x];
        const liveNeighbors = this.countNeighbors(y, x);
        if (alive && (liveNeighbors < 2 || liveNeighbors > 3)) this.nextGen[y][x] = false;
        if (!alive && liveNeighbors === 3) this.nextGen[y][x] = true;
      }
    }
    this.grid = this.nextGen;
    this.generation++;
  }

  private countNeighbors(y: number, x: number) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const ny = (y + dy + this.rows) % this.rows;
        const nx = (x + dx + this.cols) % this.cols;
        if (this.grid[ny][nx]) count++;
      }
    }
    return count;
  }

  step() {
    this.updateGrid();
  }

  clear() {
    this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
    this.nextGen = [];
    this.generation = 0;
  }

  get aliveCells() { return this.grid.flat().filter(Boolean).length; }
  get state() { return { grid: this.grid, nextGen: this.nextGen, generation: this.generation }; }
  set state(newState: { grid: boolean[][]; nextGen?: boolean[][]; generation?: number }) {
    this.grid = newState.grid;
    this.nextGen = newState.nextGen ?? this.nextGen;
    this.generation = newState.generation ?? this.generation;
  }
}