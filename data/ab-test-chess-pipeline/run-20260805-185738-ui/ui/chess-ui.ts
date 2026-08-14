import { ChessBoard, createInitialBoard, Square, Color, Piece, BoardState } from '../chess-board/chess-board';
import { Move, getPseudoLegalMoves, isSquareAttacked, isKingInCheck, isCastlingLegal } from '../chess-move-rules/chess-move-rules';
import { createGame, applyMove, getLegalMovesFor, getStatus, undoMove, Game, GameStatus } from '../chess-game/chess-game';
import { getBestMove, setDifficulty, getDifficulty, Difficulty } from '../chess-ai-engine/chess-ai-engine';


const boardElement = document.getElementById('#board')!;
const statusElement = document.getElementById('#status')!;
const newGameButton = document.getElementById('#newGameBtn')!;
const undoButton = document.getElementById('#undoBtn')!;
const difficultySelect = document.getElementById('#difficultySelect')!;

const board = new ChessBoard();
boardElement.innerHTML = board.render();

function updateStatus() {
  const status = board.getStatus();
  statusElement.textContent = status;
  if (status.includes('check')) {
    boardElement.classList.add('has-check');
  } else {
    boardElement.classList.remove('has-check');
  }
}

function handleUndo() {
  board.undoMove();
  updateStatus();
}

function handleNewGame() {
  board.resetGame();
  boardElement.innerHTML = board.render();
  updateStatus();
}

function setDifficulty(value: string) {
  const diff = Difficulty[value];
  board.setDifficulty(diff);
}

newGameButton.addEventListener('click', handleNewGame);
undoButton.addEventListener('click', handleUndo);
difficultySelect.addEventListener('change', (e) => setDifficulty((e.target as HTMLSelectElement).value));

updateStatus();