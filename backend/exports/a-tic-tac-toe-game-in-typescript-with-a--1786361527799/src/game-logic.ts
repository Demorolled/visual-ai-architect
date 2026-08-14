export interface GameState {
    board: string[];
    currentPlayer: "X" | "O";
    winner?: "X" | "O";
    isOver: boolean;
}

export function makeMove(board: string[], move: number, player: "X" | "O"): string[] {
    if (board[move] !== "") return board;
    return [...board.slice(0, move), player, ...board.slice(move + 1)];
}

export function minimax(board: string[], depth: number, isMaximizing: boolean, alpha: number, beta: number): number {
    const winner = getWinner(board);
    if (winner !== undefined) return winner === "X" ? 10 : winner === "O" ? -10 : 0;
    if (isMaximizing) {
        let bestScore = -Infinity;
        for (let i = 0; i < 9; i++) {
            if (board[i] === "") {
                const newBoard = makeMove(board, i, "O");
                const score = minimax(newBoard, depth + 1, false, alpha, beta);
                bestScore = Math.max(bestScore, score);
                alpha = Math.max(alpha, score);
                if (alpha >= beta) break;
            }
        }
        return bestScore;
    } else {
        let bestScore = Infinity;
        for (let i = 0; i < 9; i++) {
            if (board[i] === "") {
                const newBoard = makeMove(board, i, "X");
                const score = minimax(newBoard, depth + 1, true, alpha, beta);
                bestScore = Math.min(bestScore, score);
                beta = Math.min(beta, score);
                if (alpha >= beta) break;
            }
        }
        return bestScore;
    }
}

function getWinner(board: string[]): "X" | "O" | undefined {
    const lines = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
    ];
    for (const [a, b, c] of lines) {
        if (board[a] === board[b] && board[a] === board[c]) return board[a] as "X" | "O";
    }
    return undefined;
}