export class Game {
  private board: Board;
  private currentPlayer: Player;

  constructor() {
    this.board = new Board();
    this.currentPlayer = Player.X;
  }

  public play(row: number, col: number): boolean {
    if (!this.board.isValidMove(row, col)) {
      return false;
    }
    this.board.setCell(row, col, this.currentPlayer);
    if (this.board.checkWin(this.currentPlayer)) {
      return true;
    }
    this.currentPlayer = this.currentPlayer === Player.X ? Player.O : Player.X;
    return false;
  }

  public getBoard(): Board {
    return this.board;
  }

  public getCurrentPlayer(): Player {
    return this.currentPlayer;
  }
}

export class Board {
  private cells: Array<Array<Player | null>>;

  constructor() {
    this.cells = Array(3).fill(null).map(() => Array(3).fill(null));
  }

  public isValidMove(row: number, col: number): boolean {
    return row >= 0 && row < 3 && col >= 0 && col < 3 && this.cells[row][col] === null;
  }

  public setCell(row: number, col: number, player: Player): void {
    this.cells[row][col] = player;
  }

  public checkWin(player: Player): boolean {
    // Check rows
    for (let i = 0; i < 3; i++) {
      if (this.cells[i][0] === player && this.cells[i][1] === player && this.cells[i][2] === player) {
        return true;
      }
    }
    // Check columns
    for (let j = 0; j < 3; j++) {
      if (this.cells[0][j] === player && this.cells[1][j] === player && this.cells[2][j] === player) {
        return true;
      }
    }
    // Check diagonals
    if (this.cells[0][0] === player && this.cells[1][1] === player && this.cells[2][2] === player) {
      return true;
    }
    if (this.cells[0][2] === player && this.cells[1][1] === player && this.cells[2][0] === player) {
      return true;
    }
    return false;
  }
}

export enum Player {
  X = 'X',
  O = 'O'
}