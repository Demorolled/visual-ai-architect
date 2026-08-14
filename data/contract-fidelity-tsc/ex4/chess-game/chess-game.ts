import { ChessBoard, createInitialBoard, Square, Color, Piece, BoardState } from '../../scaffold/chess-board/chess-board';
import { Move, getPseudoLegalMoves, isSquareAttacked, isKingInCheck, isCastlingLegal } from '../../scaffold/chess-move-rules/chess-move-rules';

export interface Game {
  board: ChessBoard;
  history: Move[];
  turn: Color;
}

export function createGame(): Game {
  return { board: createInitialBoard(), history: [], turn: 'white' };
}

function afterMove(board: ChessBoard, move: Move): ChessBoard {
  const next = board.clone();
  next.setPiece(move.to, board.getPiece(move.from));
  next.setPiece(move.from, null);
  return next;
}

export function getLegalMovesFor(game: Game, square: Square): Move[] {
  const piece = game.board.getPiece(square);
  if (!piece || piece.color !== game.turn) return [];
  return getPseudoLegalMoves(game.board, game.turn)
    .filter(m => m.from.file === square.file && m.from.rank === square.rank)
    .filter(m => !isKingInCheck(afterMove(game.board, m), game.turn));
}

export function applyMove(game: Game, move: Move): Game {
  const nextBoard = afterMove(game.board, move);
  return { board: nextBoard, history: [...game.history, move], turn: game.turn === 'white' ? 'black' : 'white' };
}

export function getStatus(game: Game): { turn: Color; check: boolean; checkmate: boolean; stalemate: boolean } {
  const check = isKingInCheck(game.board, game.turn);
  const legal = getPseudoLegalMoves(game.board, game.turn)
    .filter(m => !isKingInCheck(afterMove(game.board, m), game.turn));
  const none = legal.length === 0;
  return { turn: game.turn, check, checkmate: none && check, stalemate: none && !check };
}

export function undoMove(game: Game): Game {
  if (game.history.length === 0) return game;
  return { board: createInitialBoard(), history: game.history.slice(0, -1), turn: game.turn };
}