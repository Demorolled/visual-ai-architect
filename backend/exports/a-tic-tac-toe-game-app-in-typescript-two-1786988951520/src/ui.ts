import { Board, Player } from '../game/game';

export function renderBoard(board: Board): void {
  for (let row = 0; row < board.length; row++) {
    console.log('| ' + board[row].join(' | ') + ' |');
    if (row < board.length - 1) {
      console.log('---------');
    }
  }
}

export function getPlayerInput(player: Player): number {
  let input: number;
  while (true) {
    input = parseInt(prompt(`Player ${player}, enter a number between 1 and 9:`));
    if (input >= 1 && input <= 9) {
      break;
    }
    console.log('Invalid input! Please enter a number between 1 and 9.');
  }
  return input;
}