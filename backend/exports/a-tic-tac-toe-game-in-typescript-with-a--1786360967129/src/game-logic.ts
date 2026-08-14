export interface Move {
    row: number;
    col: number;
}

export interface BoardState {
    player: "X" | "O";
    board: string[];
}

export const EMPTY = " ";

function isValidMove(state: BoardState, move: Move): boolean {
    return state.board[move.row * 3 + move.col] === EMPTY;
}

function getValidMoves(state: BoardState): Move[] {
    return state.board.map((cell, i) => ({ row: Math.floor(i / 3), col: i % 3 })).filter(move => isValidMove(state, move));
}

function updateBoard(state: BoardState, move: Move): BoardState {
    const newBoard = [...state.board];
    newBoard[move.row * 3 + move.col] = state.player;
    return { ...state, board: newBoard };
}

function checkWin(state: BoardState): "X" | "O" | "Tie" {
    const lines = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6]
    ];

    for (const [a, b, c] of lines) {
        if (state.board[a] && state.board[a] === state.board[b] && state.board[a] === state.board[c]) return state.board[a];
    }

    if (state.board.includes(EMPTY)) return null;

    return "Tie";
}

function minimax(state: BoardState, depth: number, isMaximizing: boolean): number {
    const result = checkWin(state);
    if (result) return "X" === result ? -1 : "O" === result ? 1 : 0;

    if (depth === 0) return 0;

    let value: number;
    if (isMaximizing) {
        value = -Infinity;
        for (const move of getValidMoves(state)) {
            const newState = updateBoard(state, move);
            value = Math.max(value, minimax(newState, depth - 1, false));
        }
    } else {
        value = +Infinity;
        for (const move of getValidMoves(state)) {
            const newState = updateBoard(state, move);
            value = Math.min(value, minimax(newState, depth - 1, true));
        }
    }

    return value;
}

export function play(state: BoardState, depth: number): Move | null {
    if (state.board.includes(EMPTY)) {
        let bestMove: Move | null = null;
        let bestValue = -Infinity;
        for (const move of getValidMoves(state)) {
            const newState = updateBoard(state, move);
            const value = minimax(newState, depth - 1, false);
            if (value > bestValue) {
                bestMove = move;
                bestValue = value;
            }
        }
        return bestMove;
    }
    return null;
}