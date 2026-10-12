export function startGame() {
  // Initialize the board and pieces
  renderBoard(board);
}

export function resetBoard() {
  // Reset the board and pieces
  renderBoard(board);
}

// Render the initial board
renderBoard(board);

// Handle user input
handleInput(board, pieces, selectedPiece);
