import { ChessBoard, createInitialBoard, Square, Color, Piece, BoardState } from './chess-board';
import { Move, getPseudoLegalMoves, isSquareAttacked, isKingInCheck, isCastlingLegal } from './chess-move-rules';

import { ChessBoard, createInitialBoard, Square, Color, Piece, BoardState } from '../chess-board/chess-board.ts';
import { Move, getPseudoLegalMoves, isSquareAttacked, isKingInCheck, isCastlingLegal } from '../chess-move-rules/chess-move-rules.ts';

// chess-ai-engine.ts

export interface AIConfig {
    depth?: number;
}

export interface MoveResult {
    move: Move | null;
    score: number;
}

class MinimaxAI {
    constructor(private board: ChessBoard, private color: Color, private config: AIConfig) {}

    private minimax(board: ChessBoard, depth: number, alpha: number, beta: number, maximizingPlayer: boolean): MoveResult {
        if (depth === 0 || board.isCheckmate(!this.color)) {
            return { move: null, score: board.evaluate(this.color) };
        }

        const moves = getPseudoLegalMoves(board, this.color);
        if (moves.length === 0) return { move: null, score: board.evaluate(this.color) };

        if (maximizingPlayer) {
            let bestScore = -Infinity;
            let bestMove: Move | null = null;

            for (const move of moves) {
                const newBoard = board.clone();
                newBoard.makeMove(move);

                const result = this.minimax(newBoard, depth - 1, alpha, beta, false);
                if (result.score > bestScore) {
                    bestScore = result.score;
                    bestMove = move;
                    alpha = Math.max(alpha, bestScore);
                    if (alpha >= beta) break;
                }
            }

            return { move: bestMove, score: bestScore };
        } else {
            let bestScore = Infinity;
            let bestMove: Move | null = null;

            for (const move of moves) {
                const newBoard = board.clone();
                newBoard.makeMove(move);

                const result = this.minimax(newBoard, depth - 1, alpha, beta, true);
                if (result.score < bestScore) {
                    bestScore = result.score;
                    bestMove = move;
                    beta = Math.min(beta, bestScore);
                    if (alpha >= beta) break;
                }
            }

            return { move: bestMove, score: bestScore };
        }
    }

    public getBestMove(): MoveResult {
        const config = this.config || { depth: 3 };
        return this.minimax(this.board, config.depth, -Infinity, Infinity, true);
    }

    public setDifficulty(difficulty: number): void {
        if (difficulty < 1 || difficulty > 4) throw new Error('Difficulty must be between 1 and 4');
        this.config = { depth: difficulty };
    }
}

export function getBestMove(board: ChessBoard, color: Color, config?: AIConfig): Move | null {
    const ai = new MinimaxAI(board, color, config);
    return ai.getBestMove().move;
}