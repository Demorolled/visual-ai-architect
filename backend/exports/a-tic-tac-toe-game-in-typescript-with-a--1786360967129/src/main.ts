import { play, minimax } from './game-logic';
const BOARD_SIZE = 3;

const renderBoard = (board) => {
  let html = '<table border="1">';
  for (let row = 0; row < BOARD_SIZE; row++) {
    html += '<tr>';
    for (let col = 0; col < BOARD_SIZE; col++) {
      html += `<td>${board[row][col]}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
};

const main = () => {
  const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(''));
  let playerTurn = 'X';
  let gameOver = false;

  const playTurn = () => {
    if (playerTurn === 'O') {
      const move = minimax(board);
      board[move.row][move.col] = 'O';
      playerTurn = 'X';
    } else {
      const row = Math.floor(Math.random() * BOARD_SIZE);
      const col = Math.floor(Math.random() * BOARD_SIZE);
      while (board[row][col] !== '') {
        row = Math.floor(Math.random() * BOARD_SIZE);
        col = Math.floor(Math.random() * BOARD_SIZE);
      }
      board[row][col] = 'X';
      playerTurn = 'O';
    }

    const winner = checkWinner(board);
    if (winner !== '') {
      gameOver = true;
      return `Player ${winner} wins!`;
    }

    if (board.every(row => row.every(cell => cell !== ''))) {
      gameOver = true;
      return "It's a draw!";
    }
  };

  const checkWinner = (board) => {
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (board[i].every(cell => cell === 'X')) return 'X';
      if (board[i].every(cell => cell === 'O')) return 'O';
    }
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (board.map(row => row[i]).every(cell => cell === 'X')) return 'X';
      if (board.map(row => row[i]).every(cell => cell === 'O')) return 'O';
    }
    if (board[0][0] === board[1][1] && board[1][1] === board[2][2] && board[0][0] !== '') return board[0][0];
    if (board[0][2] === board[1][1] && board[1][1] === board[2][0] && board[0][2] !== '') return board[0][2];
    return '';
  };

  const gameLoop = () => {
    if (!gameOver) {
      const result = playTurn();
      if (result) alert(result);
      gameOver = true;
    }
  };

  const run = () => {
    const gameLoopInterval = setInterval(gameLoop, 500);
    document.querySelector('button').addEventListener('click', () => {
      clearInterval(gameLoopInterval);
      gameLoopInterval = setInterval(gameLoop, 500);
    });
  };
};

run();