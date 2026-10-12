export class GameController {
  private board: ('white' | 'black' | null)[][];
  private currentPlayer: 'white' | 'black';
  private selectedPiece: { row: number; col: number; type: 'white' | 'black' | 'king' | 'pawn' | null } | null;
  private gameOver: boolean;
  private winner: 'white' | 'black' | null;

  constructor() {
    this.board = this.initializeBoard();
    this.currentPlayer = 'white';
    this.selectedPiece = null;
    this.gameOver = false;
    this.winner = null;
  }

  private initializeBoard() {
    const board = Array.from({ length: 8 }, () => new Array(8).fill(null));
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (row < 3 && (row + col) % 2 === 1) board[row][col] = 'white';
        if (row > 4 && (row + col) % 2 === 1) board[row][col] = 'black';
      }
    }
    return board;
  }

  private isValidMove(row: number, col: number) {
    if (row < 0 || row >= 8 || col < 0 || col >= 8) return false;
    return (row + col) % 2 === 1;
  }

  private isSelectedPiece(row: number, col: number) {
    if (this.selectedPiece) {
      return this.selectedPiece.row === row && this.selectedPiece.col === col;
    }
    return false;
  }

  private isPlayerTurn(row: number, col: number) {
    return this.board[row][col] === this.currentPlayer;
  }

  private isOpponent(row: number, col: number) {
    const piece = this.board[row][col];
    return piece !== null && piece !== this.currentPlayer;
  }

  private isKing(row: number, col: number) {
    return this.board[row][col] === 'white' && row === 0 || this.board[row][col] === 'black' && row === 7;
  }

  private isMoveValid(row: number, col: number) {
    if (this.isValidMove(row, col)) {
      const piece = this.board[row][col];
      if (piece === this.currentPlayer) {
        if (this.isPlayerTurn(row, col)) {
          return true;
        }
      }
    }
    return false;
  }

  private isCapture(row: number, col: number) {
    const piece = this.board[row][col];
    if (piece && this.isOpponent(row, col)) {
      return true;
    }
    return false;
  }

  private isJump(row: number, col: number) {
    const piece = this.board[row][col];
    if (piece && this.isOpponent(row, col)) {
      return true;
    }
    return false;
  }

  private isMultiJump(row: number, col: number) {
    const piece = this.board[row][col];
    if (piece && this.isOpponent(row, col)) {
      return true;
    }
    return false;
  }

  private isGameOver() {
    let whiteCount = 0;
    let blackCount = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (this.board[row][col] === 'white') whiteCount++;
        if (this.board[row][col] === 'black') blackCount++;
      }
    }
    return whiteCount === 0 || blackCount === 0;
  }

  private computeWinner(): 'white' | 'black' | null {
    let whiteCount = 0;
    let blackCount = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (this.board[row][col] === 'white') whiteCount++;
        if (this.board[row][col] === 'black') blackCount++;
      }
    }
    if (whiteCount === 0) return 'black';
    if (blackCount === 0) return 'white';
    return null;
  }

  public handleMove(row: number, col: number) {
    if (this.gameOver) return;
    if (this.isSelectedPiece(row, col)) {
      this.selectedPiece = { row, col, type: this.board[row][col] };
      return;
    }
    if (this.isPlayerTurn(row, col)) {
      const selected = this.board[row][col];
      if (selected) {
        this.board[row][col] = null;
        this.selectedPiece = { row, col, type: selected };
        return;
      }
    }
    if (this.isOpponent(row, col)) {
      const opponent = this.board[row][col];
      if (opponent) {
        this.board[row][col] = null;
        this.selectedPiece = { row, col, type: opponent };
        return;
      }
    }
    if (this.isCapture(row, col)) {
      const opponent = this.board[row][col];
      if (opponent) {
        this.board[row][col] = null;
        this.selectedPiece = { row, col, type: opponent };
        return;
      }
    }
    if (this.isJump(row, col)) {
      const opponent = this.board[row][col];
      if (opponent) {
        this.board[row][col] = null;
        this.selectedPiece = { row, col, type: opponent };
        return;
      }
    }
    if (this.isMultiJump(row, col)) {
      const opponent = this.board[row][col];
      if (opponent) {
        this.board[row][col] = null;
        this.selectedPiece = { row, col, type: opponent };
        return;
      }
    }
    this.gameOver = true;
    this.winner = this.computeWinner();
  }

  public getBoard() {
    return this.board;
  }

  public getCurrentPlayer() {
    return this.currentPlayer;
  }

  public getGameOver() {
    return this.gameOver;
  }

  public getWinner() {
    return this.winner;
  }
}
