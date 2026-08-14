import { ChessBoard, Color, Square } from '../chess-board/chess-board';
import { Move } from '../chess-move-rules/chess-move-rules';
export interface AIConfig { depth?: number; }
export function getBestMove(board: ChessBoard, color: Color, config?: AIConfig): Move | null { return null; }
export function setDifficulty(depth: number): AIConfig { return { depth: depth }; }
export function isCheckmated(board: ChessBoard, color: Color): boolean { return false; }