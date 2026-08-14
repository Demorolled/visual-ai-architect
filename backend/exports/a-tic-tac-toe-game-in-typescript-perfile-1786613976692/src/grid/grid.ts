import { Cell, GameState, Move, GameEvent, GameResult, GameException, Player, Game } from '../types/types.ts';

export class Game {
  private board: number[] = Array(9).fill(null);
  private currentPlayer: 'X' | 'O' = 'X';
  private winner: 'X' | 'O' | null = null;

  constructor() {}

  newGame(): void {
    this.board = Array(9).fill(null);
    this.currentPlayer = 'X';
    this.winner = null;
  }

  makeMove(row: number, col: number): void {
    const index = row * 3 + col;
    if (this.board[index] !== null || this.winner !== null) return;
    this.board[index] = this.currentPlayer === 'X' ? 1 : -1;
    this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
    this.checkWin();
  }

  isOver(): boolean {
    return this.winner !== null;
  }

  winner(): 'X' | 'O' | null {
    return this.winner;
  }

  line(): [number, number, number] | null {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
    for (const line of lines) {
      if (this.board[line[0]] !== null && this.board[line[0]] === this.board[line[1]] && this.board[line[0]] === this.board[line[2]]) {
        return this.board[line[0]] === 1 ? 'X' : 'O';
      }
    }
    return null;
  }

  checkWin(): void {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
    for (const line of lines) {
      if (this.board[line[0]] !== null && this.board[line[0]] === this.board[line[1]] && this.board[line[0]] === this.board[line[2]]) {
        this.winner = this.board[line[0]] === 1 ? 'X' : 'O';
        return;
      }
    }
    if (this.board.every((cell) => cell !== null)) {
      this.winner = null;
    }
  }
}