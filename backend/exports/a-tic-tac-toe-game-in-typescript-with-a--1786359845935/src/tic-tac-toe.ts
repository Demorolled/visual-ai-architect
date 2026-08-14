export interface TicTacToeBoard {
  board: string[];
  player: 'X' | 'O';
  winner: 'X' | 'O' | null;
  isOver: boolean;
}

export interface TicTacToePlayer {
  symbol: 'X' | 'O';
}