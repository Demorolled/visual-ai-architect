import { ChessBoard, createInitialBoard, Square, Color, Piece, BoardState } from '../chess-board/chess-board';
import { Move, getPseudoLegalMoves, isSquareAttacked, isKingInCheck, isCastlingLegal } from '../chess-move-rules/chess-move-rules';

Just code.
```typescript
interface MoveEvaluation {
    material: number;
    position: number;
}

type Color = 'white' | 'black';

const MAX_DEPTH = 4;

function getMaterialValue(piece: Piece): number {
    switch (piece) {
        case 'pawn': return 100;
        case 'knight': return 325;
        case 'bishop': return 300;
        case 'rook': return 500;
        case 'queen': return 900;
        default: throw new Error(`Unknown piece ${piece}`);
    }
}

function getEvaluation(board: ChessBoard, color: Color): number {
    let evaluation = 0;

    board.forEach((square) => {
        if (!square.piece) return;

        const sign = (color === 'white' ? 1 : -1);
        const value = getMaterialValue(square.piece);

        evaluation += sign * value;
    });

    // Add positional bonuses/penalties here
    // ...

    return evaluation;
}

function minimaxSearch(board: ChessBoard, color: Color, depth: number, alpha: number, beta: number): MoveEvaluation {
    if (depth === 0 || isKingInCheck(board, color)) {
        const material = getMaterialValue(board.getKingSquare(color).piece);
        return { material };
    }

    let bestMoveEval: MoveEvaluation | null = null;

    const moves = getPseudoLegalMoves(board);

    for (const move of moves) {
        board.move(move);

        if (!isKingInCheck(board, color)) {
            const eval = minimaxSearch(board, color, depth - 1, alpha, beta);
            if (!bestMoveEval || bestMoveEval.material < eval.material) {
                bestMoveEval = { ...eval };
            }
        }

        board.undo();

        alpha = Math.max(alpha, bestMoveEval?.material ?? -Infinity);

        if (alpha >= beta) return bestMoveEval;
    }

    return bestMoveEval ? { material: bestMoveEval.material } : null;
}

function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMoveEval || bestEval.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;

    let bestMove: Move | null = null;
    let bestEval: MoveEvaluation | null = null;

    for (const move of getPseudoLegalMoves(board)) {
        board.move(move);

        if (!isKingInCheck(board, color) && !isStalemate(board)) {
            const eval = minimaxSearch(board, color, depth - 1, -Infinity, Infinity);
            if (!bestMove || bestEval?.material < eval.material) {
                bestMove = move;
                bestEval = { material: eval.material };
            }
        }

        board.undo();
    }

    return bestMove;
}

export function setDifficulty(newDifficulty: number): void {
    MAX_DEPTH = newDifficulty;
}
``` ```typescript
function getBestMove(board: ChessBoard, color: Color, difficulty?: number): Move | null {
    const depth = difficulty || 1;