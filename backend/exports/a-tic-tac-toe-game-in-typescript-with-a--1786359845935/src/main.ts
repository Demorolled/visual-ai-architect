import { playGame, TicTacToeBoard, TicTacToePlayer } from './game-logic';

export function runGame() {
  const board: TicTacToeBoard = { board: ['', '', '', '', '', '', '', '', ''], player: 'X', winner: null, isOver: false };
  const player: TicTacToePlayer = { symbol: 'X' };
  console.log(playGame(board, player));
}