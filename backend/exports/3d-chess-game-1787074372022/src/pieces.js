class Piece {
  constructor(color, type, x, y, z) {
    this.color = color;
    this.type = type;
    this.position = { x, y, z };
  }

  move(toX, toY, toZ) {
    this.position = { x: toX, y: toY, z: toZ };
  }
}

class King extends Piece {
  constructor(color, x, y, z) {
    super(color, 'king', x, y, z);
  }
}

class Queen extends Piece {
  constructor(color, x, y, z) {
    super(color, 'queen', x, y, z);
  }
}

class Rook extends Piece {
  constructor(color, x, y, z) {
    super(color, 'rook', x, y, z);
  }
}

class Bishop extends Piece {
  constructor(color, x, y, z) {
    super(color, 'bishop', x, y, z);
  }
}

class Knight extends Piece {
  constructor(color, x, y, z) {
    super(color, 'knight', x, y, z);
  }
}

class Pawn extends Piece {
  constructor(color, x, y, z) {
    super(color, 'pawn', x, y, z);
  }
}