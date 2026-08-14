import { ChessBoard, Color, Square } from './chess-board';
import { Move } from './chess-move-rules';

export interface GameStatus { turn: Color; inCheck: boolean; checkmate: boolean; stalemate: boolean; lastMove?: Move; }
export interface Game { board: ChessBoard; history: Move[]; status: GameStatus; }
export function createGame(): Game {
  return { board: new ChessBoard(), history: [], status: { turn: 'white', inCheck: false, checkmate: false, stalemate: false } };
}
export function applyMove(game: Game, move: Move): Game { return game; }
export function getLegalMovesFor(game: Game, sq: Square): Move[] { return []; }
export function getStatus(game: Game): GameStatus { return game.status; }
export function undoMove(game: Game): Game { return game; }