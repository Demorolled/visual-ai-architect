export function makeMove(board: number[], player: number, move: number): number[] {
    board[move] = player;
    return board;
}

export function isWinningMove(board: number[], player: number, move: number): boolean {
    const updatedBoard = makeMove(board, player, move);
    for (let i = 0; i < 3; i++) {
        if (
            updatedBoard[i * 3] === player && updatedBoard[i * 3 + 1] === player && updatedBoard[i * 3 + 2] === player ||
            updatedBoard[i] === player && updatedBoard[i + 3] === player && updatedBoard[i + 6] === player ||
            updatedBoard[i * 3 + 1] === player && updatedBoard[i * 3 + 4] === player && updatedBoard[i * 3 + 7] === player
        ) {
            return true;
        }
    }
    if (updatedBoard[4] === player && updatedBoard[0] === player && updatedBoard[8] === player || updatedBoard[4] === player && updatedBoard[2] === player && updatedBoard[6] === player) {
        return true;
    }
    return false;
}

export function getBestMove(board: number[], player: number): number {
    let bestMove = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < 9; i++) {
        if (board[i] === 0) {
            const updatedBoard = makeMove(board, player, i);
            const score = minimax(updatedBoard, -player);
            if (score > bestScore) {
                bestMove = i;
                bestScore = score;
            }
        }
    }
    return bestMove;
}

export function minimax(board: number[], player: number): number {
    if (isGameOver(board)) {
        return getGameState(board);
    }
    let bestScore = -Infinity;
    for (let i = 0; i < 9; i++) {
        if (board[i] === 0) {
            const updatedBoard = makeMove(board, player, i);
            const score = minimax(updatedBoard, -player);
            if (score > bestScore) {
                bestScore = score;
            }
        }
    }
    return bestScore;
}

export function isGameOver(board: number[]): boolean {
    for (let i = 0; i < 3; i++) {
        if (
            board[i * 3] !== 0 && board[i * 3] === board[i * 3 + 1] && board[i * 3] === board[i * 3 + 2] ||
            board[i] !== 0 && board[i] === board[i + 3] && board[i] === board[i + 6]
        ) {
            return true;
        }
    }
    if (board[4] !== 0 && (board[0] === board[4] && board[4] === board[8] || board[2] === board[4] && board[4] === board[6])) {
        return true;
    }
    return false;
}

export function getGameState(board: number[]): number {
    if (isGameOver(board)) {
        return board[4] === 1 ? -1 : 1;
    }
    return 0;
}