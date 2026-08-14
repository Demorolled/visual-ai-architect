import { ChessBoard, createInitialBoard, Square, Color, Piece, BoardState } from '../../scaffold/chess-board/chess-board';
import { Move, getPseudoLegalMoves, isSquareAttacked, isKingInCheck, isCastlingLegal } from '../../scaffold/chess-move-rules/chess-move-rules';

export interface AIConfig { depth?: number; }

interface MoveResult { move: Move | null; score: number; }

const PIECE_VALUES: Record<string, number> = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20000 };

function applyMove(board: ChessBoard, move: Move): ChessBoard {
  const next = board.clone();
  next.setPiece(move.to, board.getPiece(move.from));
  next.setPiece(move.from, null);
  return next;
}

function evaluate(board: ChessBoard, color: Color): number {
  let score = 0;
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board.getPiece({ file, rank });
      if (!piece) continue;
      const value = PIECE_VALUES[piece.type] || 0;
      score += piece.color === color ? value : -value;
    }
  }
  return score;
}

function minimax(board: ChessBoard, depth: number, color: Color, alpha: number, beta: number, maximizing: boolean): MoveResult {
  if (depth === 0) return { move: null, score: evaluate(board, color) };
  const moves = getPseudoLegalMoves(board, color).filter(m => !isKingInCheck(applyMove(board, m), color));
  if (moves.length === 0) return { move: null, score: evaluate(board, color) };
  let best: MoveResult = { move: null, score: maximizing ? -Infinity : Infinity };
  for (const move of moves) {
    const result = minimax(applyMove(board, move), depth - 1, color === 'white' ? 'black' : 'white', alpha, beta, !maximizing);
    if (maximizing) {
      if (result.score > best.score) best = { move, score: result.score };
      alpha = Math.max(alpha, result.score);
    } else {
      if (result.score < best.score) best = { move, score: result.score };
      beta = Math.min(beta, result.score);
    }
    if (beta <= alpha) break;
  }
  return best;
}

export function getBestMove(board: ChessBoard, color: Color, config?: AIConfig): Move | null {
  const depth = Math.min(Math.max(config?.depth ?? 2, 1), 4);
  return minimax(board, depth, color, -Infinity, Infinity, true).move;
}

export function setDifficulty(depth: number): AIConfig {
  const clamped = Math.min(Math.max(depth, 1), 4);
  return { depth: clamped };
}