export interface State {
  board: number[][];
  player: number;
  winner: number | null;
  terminal: boolean;
}

export function minimax(state: State, depth: number, maxPlayer: boolean): number {
  if (depth === 0 || state.terminal) {
    return evaluate(state);
  }

  if (maxPlayer) {
    let bestScore = -Infinity;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (state.board[i][j] === 0) {
          state.board[i][j] = 1;
          const score = minimax(state, depth - 1, false);
          state.board[i][j] = 0;
          bestScore = Math.max(score, bestScore);
        }
      }
    }
    return bestScore;
  } else {
    let bestScore = Infinity;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (state.board[i][j] === 0) {
          state.board[i][j] = -1;
          const score = minimax(state, depth - 1, true);
          state.board[i][j] = 0;
          bestScore = Math.min(score, bestScore);
        }
      }
    }
    return bestScore;
  }
}

function evaluate(state: State): number {
  if (state.winner === 1) return 1;
  if (state.winner === -1) return -1;
  return 0;
}