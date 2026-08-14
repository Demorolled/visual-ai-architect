export interface TicTacToeBoard {
  board: string[];
  player: 'X' | 'O';
  winner: 'X' | 'O' | null;
  isOver: boolean;
}

export interface TicTacToePlayer {
  symbol: 'X' | 'O';
}

function checkWin(board: string[], player: 'X' | 'O'): 'X' | 'O' | null {
  const winningCombinations = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6] // diagonals
  ];
  for (const combo of winningCombinations) {
    if (board[combo[0]] === player && board[combo[1]] === player && board[combo[2]] === player) {
      return player;
    }
  }
  return null;
}

function minimax(board: string[], player: 'X' | 'O', alpha = -1, beta = 1): number {
  const winner = checkWin(board, player);
  if (winner) return winner === player ? 1 : -1;
  if (board.isOver) return 0;
  let score = -1;
  for (let i = 0; i < board.length; i++) {
    if (board[i] === '') {
      board[i] = player;
      const score = minimax(board, player === 'X' ? 'O' : 'X', alpha, beta);
      board[i] = '';
      if (player === 'X') {
        score > alpha && (alpha = score);
      } else {
        score < beta && (beta = score);
      }
      if (beta <= alpha) return alpha;
    }
  }
  return score;
}

export function playGame(board: TicTacToeBoard, player: TicTacToePlayer): TicTacToeBoard {
  if (board.isOver) return board;
  const winner = checkWin(board.board, player.symbol);
  if (winner) {
    board.winner = winner;
    board.isOver = true;
    return board;
  }
  const move = minimax(board.board, player.symbol);
  board.board[move] = player.symbol;
  return playGame({ ...board, player: player.symbol === 'X' ? 'O' : 'X' }, { ...player, symbol: player.symbol === 'X' ? 'O' : 'X' });
}