export type Color = 'white' | 'black';
export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export interface Piece { type: PieceType; color: Color; }
export interface Square { file: number; rank: number; }
export interface BoardState { board: (Piece | null)[][]; turn: Color; }

export class ChessBoard {
  board: (Piece | null)[][];
  turn: Color = 'white';
  constructor() {
    this.board = Array.from({ length: 8 }, () => Array(8).fill(null) as (Piece | null)[]);
  }
  getPiece(sq: Square): Piece | null {
    if (sq.file < 0 || sq.file > 7 || sq.rank < 0 || sq.rank > 7) return null;
    return this.board[sq.rank][sq.file];
  }
  setPiece(sq: Square, p: Piece | null): void {
    if (sq.file < 0 || sq.file > 7 || sq.rank < 0 || sq.rank > 7) return;
    this.board[sq.rank][sq.file] = p;
  }
  clone(): ChessBoard {
    const b = new ChessBoard();
    b.board = this.board.map(r => r.slice());
    b.turn = this.turn;
    return b;
  }
  toState(): BoardState { return { board: this.board, turn: this.turn }; }
}

export function createInitialBoard(): ChessBoard {
  const b = new ChessBoard();
  const back: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  for (let f = 0; f < 8; f++) {
    b.setPiece({ file: f, rank: 1 }, { type: 'pawn', color: 'white' });
    b.setPiece({ file: f, rank: 6 }, { type: 'pawn', color: 'black' });
    b.setPiece({ file: f, rank: 0 }, { type: back[f], color: 'white' });
    b.setPiece({ file: f, rank: 7 }, { type: back[f], color: 'black' });
  }
  return b;
}