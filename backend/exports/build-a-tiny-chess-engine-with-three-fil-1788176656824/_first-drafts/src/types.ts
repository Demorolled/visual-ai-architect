// src/types.ts

export type Piece = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 
                 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export type Square = string; // e.g., "a1", "h8"

export interface Move {
  from: Square;
  to: Square;
}