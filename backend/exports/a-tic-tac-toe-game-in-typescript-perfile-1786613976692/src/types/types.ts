export type Cell = 'X' | 'O' | null;
export type GameState = { board: Cell[]; currentPlayer: 'X' | 'O' };
export type Move = { row: number; col: number };
export enum GameEvent { Win, Tie, Ongoing }
export type GameResult = { winner: 'X' | 'O' | null; line: [number, number, number] | null };

export class GameException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameException';
  }
}

export interface Player {
  id: number;
  name?: string;
  cell: Cell;
}

export interface Game {
  state: GameState;
  players: Player[];
  events: GameEvent[];
  result: GameResult | null;
  makeMove(move: Move): void;
  checkWin(): void;
  checkTie(): void;
  reset(): void;
}