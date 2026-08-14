import { ChessBoard, createInitialBoard, Square, Color, Piece, BoardState } from '../../scaffold/chess-board/chess-board';
import { Move, getPseudoLegalMoves, isSquareAttacked, isKingInCheck, isCastlingLegal } from '../../scaffold/chess-move-rules/chess-move-rules';
import { createGame, applyMove, getLegalMovesFor, getStatus, undoMove, Game } from '../../scaffold/chess-game/chess-game';
import { getBestMove, setDifficulty, isCheckmated, AIConfig } from '../../scaffold/chess-ai-engine/chess-ai-engine';

const GLYPHS: Record<string, string> = {
  'white-king': '♔', 'white-queen': '♕', 'white-rook': '♖', 'white-bishop': '♗', 'white-knight': '♘', 'white-pawn': '♙',
  'black-king': '♚', 'black-queen': '♛', 'black-rook': '♜', 'black-bishop': '♝', 'black-knight': '♞', 'black-pawn': '♟',
};

export function render(container: HTMLElement): void {
  container.innerHTML = '';
  const board = createInitialBoard();
  let difficulty = 2;

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(8, 60px)';
  grid.style.gridTemplateRows = 'repeat(8, 60px)';

  const draw = () => {
    grid.innerHTML = '';
    for (let rank = 7; rank >= 0; rank--) {
      for (let file = 0; file < 8; file++) {
        const cell = document.createElement('button');
        cell.style.width = '60px';
        cell.style.height = '60px';
        cell.style.fontSize = '36px';
        cell.style.background = (rank + file) % 2 === 0 ? '#f0d9b5' : '#b58863';
        const piece = board.getPiece({ file, rank });
        if (piece) cell.textContent = GLYPHS[`${piece.color}-${piece.type}`] ?? '';
        cell.addEventListener('click', () => {
          const move = { from: { file, rank }, to: { file: file + 1, rank: rank + 1 } };
          const candidate = getPseudoLegalMoves(board, 'white')
            .filter(m => m.from.file === file && m.from.rank === rank)
            .find(m => m.to.file === move.to.file && m.to.rank === move.to.rank);
          if (!candidate) return;
          applyMoveLocal(candidate);
          const ai = getBestMove(board, 'black', { depth: difficulty });
          if (ai) applyMoveLocal(ai);
          draw();
        });
        grid.appendChild(cell);
      }
    }
  };

  function applyMoveLocal(m: Move): void {
    const from = board.getPiece(m.from);
    board.setPiece(m.to, from);
    board.setPiece(m.from, null);
  }

  const diff = document.createElement('select');
  [1, 2, 3, 4].forEach(d => {
    const opt = document.createElement('option');
    opt.value = String(d);
    opt.textContent = `Depth ${d}`;
    diff.appendChild(opt);
  });
  diff.value = '2';
  diff.addEventListener('change', () => { difficulty = Number(diff.value); setDifficulty(difficulty); });

  draw();
  container.append(diff, grid);
}