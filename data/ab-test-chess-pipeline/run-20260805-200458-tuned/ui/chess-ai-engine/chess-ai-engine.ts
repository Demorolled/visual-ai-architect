import { ChessBoard, Color, Square } from '../chess-board/chess-board';
import { Move } from '../chess-move-rules/chess-move-rules';

export type Difficulty = 1 | 2 | 3 | 4;
export function getBestMove(board: ChessBoard, color: Color, difficulty?: Difficulty): Move | null { return null; }
export function setDifficulty(d: Difficulty): void {}
export function getDifficulty(): Difficulty { return 2; }