// FILE: src/types.ts

export enum Piece {
  EMPTY = ' ',
  PAWN = 'P',
  KNIGHT = 'N',
  BISHOP = 'B',
  ROOK = 'R',
  QUEEN = 'Q',
  KING = 'K',
}

export type Square = [number, number];

export interface Move {
  from: Square;
  to: Square;
}