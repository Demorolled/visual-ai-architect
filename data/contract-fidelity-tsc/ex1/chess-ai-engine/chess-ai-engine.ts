import { ChessBoard, createInitialBoard, Square, Color, Piece, BoardState } from '../../scaffold/chess-board/chess-board';
import { Move, getPseudoLegalMoves, isSquareAttacked, isKingInCheck, isCastlingLegal } from '../../scaffold/chess-move-rules/chess-move-rules';

export interface AIConfig { depth?: number; }

const PIECE_VALUES: Record<string, number> = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20000 };

function makeMoveLocal(board: ChessBoard, from: Square, to: Square): ChessBoard {
  const next = board.clone();
  next.setPiece(to, board.getPiece(from));
  next.setPiece(from, null);
  return next;
}

function evaluateMaterial(board: ChessBoard, color: Color): number {
  let score = 0;
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board.getPiece({ file, rank });
      if (!piece) continue;
      score += (PIECE_VALUES[piece.type] || 0) * (piece.color === color ? 1 : -1);
    }
  }
  return score;
}

function inCheckAfterMove(board: ChessBoard, from: Square, to: Square, color: Color): boolean {
  return isKingInCheck(makeMoveLocal(board, from, to), color);
}

function search(board: ChessBoard, depth: number, color: Color, alpha: number, beta: number, maximizing: boolean): { move: Move | null; score: number } {
  if (depth === 0) return { move: null, score: evaluateMaterial(board, color) };
  let best = { move: null as Move | null, score: maximizing ? -Infinity : Infinity };
  let any = false;
  for (const move of getPseudoLegalMoves(board, color)) {
    if (inCheckAfterMove(board, move.from, move.to, color)) continue;
    any = true;
    const result = search(makeMoveLocal(board, move.from, move.to), depth - 1, color === 'white' ? 'black' : 'white', alpha, beta, !maximizing);
    if (maximizing) {
      if (result.score > best.score) best = { move, score: result.score };
      alpha = Math.max(alpha, result.score);
    } else {
      if (result.score < best.score) best = { move, score: result.score };
      beta = Math.min(beta, result.score);
    }
    if (beta <= alpha) break;
  }
  return any ? best : { move: null, score: evaluateMaterial(board, color) };
}

export function getBestMove(board: ChessBoard, color: Color, config?: AIConfig): Move | null {
  const depth = Math.min(Math.max(config?.depth ?? 2, 1), 4);
  return search(board, depth, color, -Infinity, Infinity, true).move;
}

export function setDifficulty(depth: number): AIConfig {
  return { depth: Math.min(Math.max(depth, 1), 4) };
}