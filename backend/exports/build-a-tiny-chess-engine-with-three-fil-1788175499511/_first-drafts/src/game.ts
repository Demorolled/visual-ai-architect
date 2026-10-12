// FILE: src/game.ts

import { Piece, Square, Move } from './types';

const startingPosition: Map<Square, Piece> = new Map([
  [[0, 0], Piece.ROOK], [[1, 0], Piece.KNIGHT], [[2, 0], Piece.BISHOP], [[3, 0], Piece.KING],
  [[4, 0], Piece.QUEEN], [[5, 0], Piece.BISHOP], [[6, 0], Piece.KNIGHT], [[7, 0], Piece.ROOK],
  // ... other pieces go here
]);

function* generateMoves(position: Map<Square, Piece>, pieceType: Piece): Generator<Move> {
  // TODO: implement move generation logic for the given piece type
}

export class ChessGame {
  private position: Map<Square, Piece>

  constructor() {
    this.position = new Map(startingPosition);
  }

  getLegalMoves(): Move[] {
    const moves: Move[] = [];

    for (const [square, piece] of this.position) {
      if (piece !== Piece.EMPTY) {
        for (const move of generateMoves(this.position, piece)) {
          moves.push(move);
        }
      }
    }

    return moves;
  }
}
