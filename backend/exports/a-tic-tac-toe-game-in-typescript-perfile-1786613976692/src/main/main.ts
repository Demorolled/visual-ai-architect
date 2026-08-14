import { DATABASE_URL } from '../config/config.ts';
import { renderBoard, handleMove } from '../ui/ui.ts';

export function start() {
  try {
    console.log('Starting Tic-Tac-Toe Game...');
    const initialState = Array.from({ length: 3 }, () => Array(3).fill(null));
    const board = { cells: initialState };

    function renderBoard() {
      const gameContainer = document.createElement('div');
      gameContainer.className = 'game-board';
      for (let row = 0; row < 3; row++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        for (let col = 0; col < 3; col++) {
          const cellDiv = document.createElement('div');
          cellDiv.className = 'cell';
          cellDiv.textContent = board.cells[row][col] || '';
          rowDiv.appendChild(cellDiv);
        }
        gameContainer.appendChild(rowDiv);
      }
      document.body.appendChild(gameContainer);
    }

    function handleMove(row: number, col: number) {
      if (board.cells[row][col] !== null) return;
      board.cells[row][col] = 'X';
      renderBoard();
      checkForWin();
    }

    function checkForWin() {
      const winningCombinations = [
        [[0, 0], [0, 1], [0, 2]],
        [[1, 0], [1, 1], [1, 2]],
        [[2, 0], [2, 1], [2, 2]],
        [[0, 0], [1, 0], [2, 0]],
        [[0, 1], [1, 1], [2, 1]],
        [[0, 2], [1, 2], [2, 2]],
        [[0, 0], [1, 1], [2, 2]],
        [[0, 2], [1, 1], [2, 0]],
      ];
      for (const combo of winningCombinations) {
        const [a, b, c] = combo;
        if (board.cells[a[0]][a[1]] === board.cells[b[0]][b[1]] && board.cells[a[0]][a[1]] === board.cells[c[0]][c[1]] && board.cells[a[0]][a[1]] !== null) {
          console.log('Player wins!');
          return;
        }
      }
      if (board.cells.every(row => row.every(cell => cell !== null))) {
        console.log('Draw!');
      }
    }

    renderBoard();
    process.stdin.on('data', (chunk) => {
      const input = chunk.toString().trim().split(',');
      if (input.length !== 2) return;
      const row = parseInt(input[0], 10);
      const col = parseInt(input[1], 10);
      handleMove(row, col);
    });

    process.on('SIGTERM', () => {
      console.log('Shutting down...');
      process.exit(0);
    });
  } catch (error) {
    console.error('An error occurred:', error);
  }
}