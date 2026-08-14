export interface Board {
    cells: string[];
    width: number;
    height: number;
}

export enum Player {
    X = 'X',
    O = 'O',
    Empty = ' '
}

export function makeMove(board: Board, player: Player, row: number, col: number): Board {
    if (board.cells[row * board.width + col] !== Player.Empty) return board;
    const newCells = [...board.cells];
    newCells[row * board.width + col] = player === Player.X ? Player.X : Player.O;
    return { cells: newCells, width: board.width, height: board.height };
}

export function evaluate(board: Board): number {
    if (isWin(board, Player.X)) return 1;
    if (isWin(board, Player.O)) return -1;
    return 0;
}

export function isWin(board: Board, player: Player): boolean {
    const { width, height } = board;
    for (let i = 0; i < height; i++) {
        if (board.cells.slice(i * width, (i + 1) * width).every(cell => cell === player)) return true;
        if (board.cells.slice(i, i + height * width, width).every(cell => cell === player)) return true;
    }
    for (let j = 0; j < width; j++) {
        if (board.cells.slice(j, board.width * height, board.width).every(cell => cell === player)) return true;
    }
    if (board.cells.every((cell, index) => index % (width + 1) === 0 && cell === player)) return true;
    if (board.cells.every((cell, index) => index % (width - 1) === width - 2 && cell === player)) return true;
    return false;
}

export function getAvailableCells(board: Board): number[] {
    return board.cells.reduce((acc, cell, index) => cell === Player.Empty ? [...acc, index] : acc, []);
}

export function minimax(board: Board, depth: number, isMaximizing: boolean): number {
    const result = evaluate(board);
    if (result !== 0) return result;
    if (getAvailableCells(board).length === 0) return 0;

    if (isMaximizing) {
        let best = -Infinity;
        for (const cell of getAvailableCells(board)) {
            const newBoard = makeMove(board, Player.X, Math.floor(cell / board.width), cell % board.width);
            const score = minimax(newBoard, depth + 1, false);
            best = Math.max(best, score);
        }
        return best;
    } else {
        let best = Infinity;
        for (const cell of getAvailableCells(board)) {
            const newBoard = makeMove(board, Player.O, Math.floor(cell / board.width), cell % board.width);
            const score = minimax(newBoard, depth + 1, true);
            best = Math.min(best, score);
        }
        return best;
    }
}

export function getBestMove(board: Board): { row: number; col: number } {
    let bestScore = -Infinity;
    let move: { row: number; col: number } = { row: -1, col: -1 };

    for (const cell of getAvailableCells(board)) {
        const row = Math.floor(cell / board.width);
        const col = cell % board.width;
        const newBoard = makeMove(board, Player.X, row, col);
        const score = minimax(newBoard, 0, false);

        if (score > bestScore) {
            bestScore = score;
            move = { row, col };
        }
    }

    return move;
}

export const MinMax = getBestMove;