class ChessBoard {
  constructor() {
    this.size = 12;
    this.board = [];
    this.initBoard();
  }

  initBoard() {
    for (let i = 0; i < this.size; i++) {
      this.board[i] = [];
      for (let j = 0; j < this.size; j++) {
        this.board[i][j] = null;
      }
    }
  }

  placePiece(piece, x, y) {
    this.board[x][y] = piece;
  }

  getPiece(x, y) {
    return this.board[x][y];
  }
}

module.exports = ChessBoard;