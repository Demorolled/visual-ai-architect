import { ChessBoard, createInitialBoard, Square, Color, Piece, BoardState } from '../../scaffold/chess-board/chess-board';
import { Move, getPseudoLegalMoves, isSquareAttacked, isKingInCheck, isCastlingLegal } from '../../scaffold/chess-move-rules/chess-move-rules';
import { createGame, applyMove, getLegalMovesFor, getStatus, undoMove, Game } from '../../scaffold/chess-game/chess-game';
import { getBestMove, setDifficulty, isCheckmated, AIConfig } from '../../scaffold/chess-ai-engine/chess-ai-engine';

export function render(container: HTMLElement): void {
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'chess-app';
  const boardEl = document.createElement('div');
  boardEl.style.display = 'grid';
  boardEl.style.gridTemplateColumns = 'repeat(8, 60px)';
  boardEl.style.gridTemplateRows = 'repeat(8, 60px)';

  const game = createGame();
  const glyphs: Record<string, string> = {
    'white-king': '♔', 'white-queen': '♕', 'white-rook': '♖', 'white-bishop': '♗', 'white-knight': '♘', 'white-pawn': '♙',
    'black-king': '♚', 'black-queen': '♛', 'black-rook': '♜', 'black-bishop': '♝', 'black-knight': '♞', 'black-pawn': '♟',
  };

  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) {
      const cell = document.createElement('button');
      cell.dataset.file = String(file);
      cell.dataset.rank = String(rank);
      cell.style.width = '60px';
      cell.style.height = '60px';
      cell.style.fontSize = '36px';
      cell.style.background = (rank + file) % 2 === 0 ? '#f0d9b5' : '#b58863';
      const piece = game.board.getPiece({ file, rank });
      if (piece) cell.textContent = glyphs[`${piece.color}-${piece.type}`] || '';
      cell.addEventListener('click', () => {
        const sq = { file: Number(cell.dataset.file), rank: Number(cell.dataset.rank) };
        const moves = getLegalMovesFor(game, sq);
        if (moves.length > 0) {
          const move = moves[0];
          applyMove(game, move);
          render(container);
        }
      });
      boardEl.appendChild(cell);
    }
  }
  wrapper.appendChild(boardEl);

  const status = getStatus(game);
  const statusEl = document.createElement('div');
  statusEl.textContent = status.checkmate ? 'Checkmate' : status.check ? 'Check!' : `${status.turn} to move`;
  wrapper.appendChild(statusEl);

  const undoBtn = document.createElement('button');
  undoBtn.textContent = 'Undo';
  undoBtn.addEventListener('click', () => { undoMove(game); render(container); });
  wrapper.appendChild(undoBtn);

  container.appendChild(wrapper);
}