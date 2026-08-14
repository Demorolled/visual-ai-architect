import { ChessBoard, Color, Square, Piece, BoardState } from '../chess-board/chess-board';
import { Move } from '../chess-move-rules/chess-move-rules';
export interface Game { board: ChessBoard; history: Move[]; turn: Color; }
export function createGame(): Game { return { board: new ChessBoard(), history: [], turn: 'white' }; }
export function applyMove(game: Game, move: Move): Game { return game; }
export function getLegalMovesFor(game: Game, sq: Square): Move[] { return []; }
export function getStatus(game: Game): { turn: Color; check: boolean; checkmate: boolean; stalemate: boolean } {
  return { turn: 'white', check: false, checkmate: false, stalemate: false };
}
export function undoMove(game: Game): Game { return game; }