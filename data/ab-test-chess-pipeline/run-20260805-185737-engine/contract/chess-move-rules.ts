import { ChessBoard, Color, Piece, PieceType, Square } from './chess-board';

export interface Move { from: Square; to: Square; promotion?: PieceType; }

const DIRS: Record<'rook' | 'bishop' | 'queen', [number, number][]> = {
  rook: [[1,0],[-1,0],[0,1],[0,-1]],
  bishop: [[1,1],[1,-1],[-1,1],[-1,-1]],
  queen: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
};
const KNIGHT: [number, number][] = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
const KING: [number, number][] = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

function onBoard(f: number, r: number): boolean { return f >= 0 && f <= 7 && r >= 0 && r <= 7; }

function attacks(b: ChessBoard, sq: Square, byColor: Color, pieceType: PieceType): boolean {
  if (pieceType === 'knight') {
    for (const [df, dr] of KNIGHT) {
      const f = sq.file + df, r = sq.rank + dr;
      if (!onBoard(f, r)) continue;
      const p = b.getPiece({ file: f, rank: r });
      if (p && p.type === 'knight' && p.color === byColor) return true;
    }
    return false;
  }
  if (pieceType === 'king') {
    for (const [df, dr] of KING) {
      const f = sq.file + df, r = sq.rank + dr;
      if (!onBoard(f, r)) continue;
      const p = b.getPiece({ file: f, rank: r });
      if (p && p.type === 'king' && p.color === byColor) return true;
    }
    return false;
  }
  if (pieceType === 'pawn') {
    const dir = byColor === 'white' ? 1 : -1;
    for (const df of [-1, 1]) {
      const f = sq.file + df, r = sq.rank + dir;
      if (!onBoard(f, r)) continue;
      const p = b.getPiece({ file: f, rank: r });
      if (p && p.type === 'pawn' && p.color === byColor) return true;
    }
    return false;
  }
  const sliders = pieceType === 'rook' ? DIRS.rook : pieceType === 'bishop' ? DIRS.bishop : DIRS.queen;
  for (const [df, dr] of sliders) {
    let f = sq.file + df, r = sq.rank + dr;
    while (onBoard(f, r)) {
      const p = b.getPiece({ file: f, rank: r });
      if (p) { if (p.type === pieceType && p.color === byColor) return true; break; }
      f += df; r += dr;
    }
  }
  return false;
}

export function isSquareAttacked(b: ChessBoard, sq: Square, byColor: Color): boolean {
  const types: PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
  return types.some(t => attacks(b, sq, byColor, t));
}

export function isKingInCheck(b: ChessBoard, color: Color): boolean {
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = b.getPiece({ file: f, rank: r });
      if (p && p.type === 'king' && p.color === color) {
        return isSquareAttacked(b, { file: f, rank: r }, color === 'white' ? 'black' : 'white');
      }
    }
  }
  return false;
}

export function getPseudoLegalMoves(b: ChessBoard, color: Color): Move[] {
  const moves: Move[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = b.getPiece({ file: f, rank: r });
      if (!p || p.color !== color) continue;
      const sq = { file: f, rank: r };
      if (p.type === 'pawn') {
        const dir = color === 'white' ? 1 : -1;
        const start = color === 'white' ? 1 : 6;
        if (onBoard(f, r + dir) && !b.getPiece({ file: f, rank: r + dir })) {
          moves.push({ from: sq, to: { file: f, rank: r + dir } });
          if (r === start && !b.getPiece({ file: f, rank: r + 2 * dir })) moves.push({ from: sq, to: { file: f, rank: r + 2 * dir } });
        }
        for (const df of [-1, 1]) {
          const t = { file: f + df, rank: r + dir };
          if (onBoard(t.file, t.rank)) {
            const target = b.getPiece(t);
            if (target && target.color !== color) moves.push({ from: sq, to: t });
          }
        }
      } else if (p.type === 'knight') {
        for (const [df, dr] of KNIGHT) {
          const t = { file: f + df, rank: r + dr };
          if (!onBoard(t.file, t.rank)) continue;
          const target = b.getPiece(t);
          if (!target || target.color !== color) moves.push({ from: sq, to: t });
        }
      } else if (p.type === 'king') {
        for (const [df, dr] of KING) {
          const t = { file: f + df, rank: r + dr };
          if (!onBoard(t.file, t.rank)) continue;
          const target = b.getPiece(t);
          if (!target || target.color !== color) moves.push({ from: sq, to: t });
        }
      } else {
        const dirs = p.type === 'rook' ? DIRS.rook : p.type === 'bishop' ? DIRS.bishop : DIRS.queen;
        for (const [df, dr] of dirs) {
          let ff = f + df, rr = r + dr;
          while (onBoard(ff, rr)) {
            const target = b.getPiece({ file: ff, rank: rr });
            if (!target) { moves.push({ from: sq, to: { file: ff, rank: rr } }); }
            else { if (target.color !== color) moves.push({ from: sq, to: { file: ff, rank: rr } }); break; }
            ff += df; rr += dr;
          }
        }
      }
    }
  }
  return moves;
}

export function isCastlingLegal(b: ChessBoard, color: Color, side: 'kingside' | 'queenside'): boolean {
  const rank = color === 'white' ? 0 : 7;
  const king = b.getPiece({ file: 4, rank });
  if (!king || king.type !== 'king' || king.color !== color) return false;
  const rookFile = side === 'kingside' ? 7 : 0;
  const rook = b.getPiece({ file: rookFile, rank });
  if (!rook || rook.type !== 'rook' || rook.color !== color) return false;
  const path = side === 'kingside' ? [5, 6] : [1, 2, 3];
  for (const f of path) if (b.getPiece({ file: f, rank })) return false;
  if (isSquareAttacked(b, { file: 4, rank }, color === 'white' ? 'black' : 'white')) return false;
  if (isSquareAttacked(b, { file: side === 'kingside' ? 5 : 3, rank }, color === 'white' ? 'black' : 'white')) return false;
  return true;
}