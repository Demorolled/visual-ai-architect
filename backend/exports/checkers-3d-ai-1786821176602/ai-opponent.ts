import { GameState } from '../game-state/game-state.ts';

export class AIController {
  private depthLimit: number;

  constructor(depthLimit?: number) {
    this.depthLimit = depthLimit || 3;
  }

  public makeMove(board: Array<Array<string | null>>, currentPlayer: 'white' | 'black'): { row: number; col: number } {
    const bestMove = this.minimax(board, this.depthLimit, -Infinity, Infinity, currentPlayer);
    return bestMove;
  }

  private minimax(board: Array<Array<string | null>>, depth: number, alpha: number, beta: number, player: 'white' | 'black'): { row: number; col: number } {
    if (depth === 0 || this.isGameOver(board)) {
      return { row: -1, col: -1 };
    }

    let bestMove = { row: -1, col: -1 };
    let bestValue = player === 'white' ? -Infinity : Infinity;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (board[row][col] === player) {
          for (let dr of [-1, 1]) {
            for (let dc of [-1, 1]) {
              const newRow = row + dr;
              const newCol = col + dc;
              if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8 && board[newRow][newCol] === null) {
                const tempBoard = this.cloneBoard(board);
                tempBoard[newRow][newCol] = player;
                tempBoard[row][col] = null;
                const value = this.minimax(tempBoard, depth - 1, alpha, beta, player === 'white' ? 'black' : 'white').row;
                if (player === 'white') {
                  if (value > bestValue) {
                    bestValue = value;
                    bestMove = { row: newRow, col: newCol };
                    alpha = Math.max(alpha, bestValue);
                  }
                } else {
                  if (value < bestValue) {
                    bestValue = value;
                    bestMove = { row: newRow, col: newCol };
                    beta = Math.min(beta, bestValue);
                  }
                }
                if (alpha >= beta) break;
              }
            }
          }
        }
      }
    }
    return bestMove;
  }

  private isGameOver(board: Array<Array<string | null>>): boolean {
    let whiteCount = 0;
    let blackCount = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (board[row][col] === 'white') whiteCount++;
        if (board[row][col] === 'black') blackCount++;
      }
    }
    return whiteCount === 0 || blackCount === 0;
  }

  private cloneBoard(board: Array<Array<string | null>>): Array<Array<string | null>> {
    return board.map(row => row.slice());
  }
}