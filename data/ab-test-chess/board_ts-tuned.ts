class BoardState {
  private board: string[][];
  private turn: 'white' | 'black';

  constructor() {
    this.board = [];
    this.turn = 'white';
    this.initializeBoard();
  }

  private initializeBoard() {
    // Initialize the board with the initial setup
    for (let i = 0; i < 8; i++) {
      this.board[i] = [];
      for (let j = 0; j < 8; j++) {
        if (i === 0 || i === 7) {
          if (j === 0 || j === 7) {
            this.board[i][j] = 'R';
          } else if (j === 1 || j === 6) {
            this.board[i][j] = 'N';
          } else if (j === 2 || j === 5) {
            this.board[i][j] = 'B';
          } else if (j === 3) {
            this.board[i][j] = 'Q';
          } else {
            this.board[i][j] = 'K';
          }
        } else {
          this.board[i][j] = ' ';
        }
      }
    }
  }

  public getBoard(): string[][] {
    return this.board;
  }

  public getTurn(): 'white' | 'black' {
    return this.turn;
  }

  public setTurn(turn: 'white' | 'black'): void {
    this.turn = turn;
  }

  public applyMove(from: string, to: string): boolean {
    const [fromRow, fromCol] = from.split('').map(c => parseInt(c));
    const [toRow, toCol] = to.split('').map(c => parseInt(c));

    if (fromRow < 0 || fromRow >= 8 || fromCol < 0 || fromCol >= 8 || toRow < 0 || toRow >= 8 || toCol < 0 || toCol >= 8) {
      throw new Error('Invalid move: coordinates out of bounds');
    }

    const piece = this.board[fromRow][fromCol];
    if (!piece || piece.toLowerCase() !== this.turn) {
      throw new Error('Invalid move: no piece or wrong color');
    }

    // Check for valid move logic here
    // For simplicity, let's assume a basic move is always valid
    this.board[fromRow][fromCol] = ' ';
    this.board[toRow][toCol] = piece;
    this.setTurn(this.turn === 'white' ? 'black' : 'white');

    return true;
  }

  public serializeToFen(): string {
    let fen = '';

    // Ranks
    for (let rank = 7; rank >= 0; rank--) {
      let emptyCount = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.board[rank][file];
        if (piece === ' ') {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            fen += emptyCount.toString();
            emptyCount = 0;
          }
          fen += piece;
        }
      }
      if (emptyCount > 0) {
        fen += emptyCount.toString();
      }
      if (rank !== 0) {
        fen += '/';
      }
    }

    // Active color
    fen += ' ';
    fen += this.turn === 'white' ? 'w' : 'b';

    // Castling
    fen += ' ';
    // King-side castling
    if (this.board[rank][5] === 'K' && this.board[rank][6] === ' ') {
      fen += 'K';
    }
    // Queen-side castling
    if (this.board[rank][1] === 'K' && this.board[rank][2] === ' ' && this.board[rank][3] === ' ') {
      fen += 'Q';
    }
    // Both castling
    if (fen.includes('K') && fen.includes('Q')) {
      fen += 'Q';
    }

    // En passant
    fen += ' ';

    // Halfmove clock
    fen += '0';

    // Fullmove number
    fen += '1';

    return fen;
  }

  public parseFen(fen: string): void {
    // Parse the FEN string and update the board state
    const parts = fen.split(' ');
    if (parts.length !== 6) {
      throw new Error('Invalid FEN format');
    }

    let rank = 7;
    let file = 0;
    for (const square of parts[0]) {
      if (square >= '0' && square <= '9') {
        file += parseInt(square);
      } else {
        if (square === 'p') {
          this.board[rank][