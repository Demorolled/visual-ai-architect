import { GameState } from './gameLogic';

export class Board {
  private boardSize: number;
  private cells: string[];
  private gameLogic: GameLogic;

  constructor(gameLogic: GameLogic, boardSize: number = 3) {
    this.boardSize = boardSize;
    this.cells = new Array(boardSize * boardSize).fill(' ');
    this.gameLogic = gameLogic;
  }

  renderBoard(): string {
    const rows = [];
    for (let i = 0; i < this.boardSize; i++) {
      const row = this.cells.slice(i * this.boardSize, (i + 1) * this.boardSize).join(' | ');
      rows.push(row);
    }
    return rows.join('\n' + '-'.repeat(this.boardSize * 4 - 3) + '\n');
  }

  updateCell(row: number, col: number, player: string): void {
    const index = row * this.boardSize + col;
    if (this.cells[index] === ' ') {
      this.cells[index] = player;
    }
  }

  isCellEmpty(row: number, col: number): boolean {
    const index = row * this.boardSize + col;
    return this.cells[index] === ' ';
  }

  resetBoard(): void {
    this.cells = new Array(this.boardSize * this.boardSize).fill(' ');
  }
}