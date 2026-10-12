export interface GameState {
  board: string[];
  currentPlayer: 'X' | 'O';
  isGameOver: boolean;
  winner?: 'X' | 'O' | 'Draw';
}

export class GameLogic {
  private board: string[];
  private currentPlayer: 'X' | 'O';
  private isGameOver: boolean;
  private winner?: 'X' | 'O' | 'Draw';

  constructor() {
    this.board = Array(9).fill('');
    this.currentPlayer = 'X';
    this.isGameOver = false;
    this.winner = undefined;
  }

  public makeMove(index: number): void {
    if (this.isGameOver || this.board[index] !== '') {
      return;
    }

    this.board[index] = this.currentPlayer;
    this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
    this.checkGameOver();
  }

  public getBoard(): string[] {
    return this.board;
  }

  public getCurrentPlayer(): 'X' | 'O' {
    return this.currentPlayer;
  }

  public isGameOver(): boolean {
    return this.isGameOver;
  }

  public getWinner(): 'X' | 'O' | 'Draw' | undefined {
    return this.winner;
  }

  private checkGameOver(): void {
    const winConditions = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];

    for (const condition of winConditions) {
      const [a, b, c] = condition;
      if (this.board[a] !== '' && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
        this.isGameOver = true;
        this.winner = this.board[a];
        return;
      }
    }

    if (!this.board.includes('')) {
      this.isGameOver = true;
      this.winner = 'Draw';
    }
  }
}