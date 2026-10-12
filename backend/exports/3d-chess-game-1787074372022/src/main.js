import { startGame } from './chess.js';
import { renderBoard } from './render.js';
import { handleInput } from './input.js';

const board = document.getElementById('chessBoard');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');

const pieces = [];
const selectedPiece = null;

function startGame() {
  // Initialize the board and pieces
  renderBoard(board);
}

function resetBoard() {
  // Reset the board and pieces
  renderBoard(board);
}

// Render the initial board
renderBoard(board);

// Handle user input
handleInput(board, pieces, selectedPiece);
