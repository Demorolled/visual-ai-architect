import { GameLogic, GameState, Board } from '../gameLogic/gameLogic.ts';

export function runGame(): void {
  const game = new GameLogic();
  game.startGame();

  const gameState = game.getGameState();
  const board = new Board(gameState.board);

  console.log('Tic-Tac-Toe Game');
  console.log('Player 1: X');
  console.log('Player 2: O');
  console.log('-------------');

  while (!game.isGameOver()) {
    console.log('Current Board:');
    console.log(board.toString());

    const currentPlayer = gameState.currentPlayer;
    console.log(`Player ${currentPlayer}'s turn`);

    const row = parseInt(prompt(`Enter row (0-${gameState.size - 1}):`), 10);
    const col = parseInt(prompt(`Enter column (0-${gameState.size - 1}):`), 10);

    try {
      game.makeMove(row, col);
    } catch (error) {
      console.error(error.message);
      continue;
    }
  }

  console.log('Current Board:');
  console.log(board.toString());

  const winner = game.getWinner();
  if (winner) {
    console.log(`Player ${winner} wins!`);
  } else {
    console.log('It\'s a tie!');
  }
}