const board = document.getElementById('board');
const pieces = document.getElementsByClassName('piece');
const turnDisplay = document.getElementById('turnDisplay');
const winnerDisplay = document.getElementById('winnerDisplay');
const gameBoard = [
  [null,null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null,null]
];
const currentPlayer = 'white';
const selectedPiece = null;
const selectedSquare = null;
const moves = [];
const turn = 1;
const winner = null;
function renderBoard() {
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      const square = document.createElement('div');
      square.className = 'square';
      square.style.left = (j * 40) + 'px';
      square.style.top = (i * 40) + 'px';
      square.style.backgroundColor = (i + j) % 2 === 0 ? '#ccc' : '#999';
      if (gameBoard[i][j] !== null) {
        const piece = document.createElement('div');
        piece.className = 'piece';
        piece.style.backgroundColor = gameBoard[i][j].color;
        piece.style.left = (j * 40) + 'px';
        piece.style.top = (i * 40) + 'px';
        piece.style.zIndex = 1;
        square.appendChild(piece);
      }
      board.appendChild(square);
    }
  }
}
function selectPiece(event) {
  const piece = event.target;
  if (selectedPiece !== null) {
    selectedPiece.style.backgroundColor = '';
  }
  selectedPiece = piece;
  selectedPiece.style.backgroundColor = '#ffcc00';
  if (selectedSquare !== null) {
    selectedSquare.style.backgroundColor = '';
  }
  selectedSquare = document.getElementById('square-' + selectedPiece.dataset.row + '-' + selectedPiece.dataset.col);
  selectedSquare.style.backgroundColor = '#ffcc00';
}
function movePiece(event) {
  const newSquare = event.target;
  if (selectedSquare !== null) {
    selectedSquare.style.backgroundColor = '';
  }
  selectedSquare = newSquare;
  selectedSquare.style.backgroundColor = '#ffcc00';
  const piece = document.getElementById('piece-' + selectedPiece.dataset.row + '-' + selectedPiece.dataset.col);
  piece.style.left = newSquare.offsetLeft;
  piece.style.top = newSquare.offsetTop;
  selectedPiece.dataset.row = selectedSquare.dataset.row;
  selectedPiece.dataset.col = selectedSquare.dataset.col;
  selectedPiece = null;
  selectedSquare = null;
}
function renderTurn() {
  turnDisplay.textContent = 'Turn: ' + currentPlayer;
}
function renderWinner() {
  winnerDisplay.textContent = 'Winner: ' + winner;
}
function initGame() {
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      gameBoard[i][j] = null;
    }
  }
  currentPlayer = 'white';
  selectedPiece = null;
  selectedSquare = null;
  moves = [];
  turn = 1;
  winner = null;
  renderBoard();
  renderTurn();
  renderWinner();
}
initGame();