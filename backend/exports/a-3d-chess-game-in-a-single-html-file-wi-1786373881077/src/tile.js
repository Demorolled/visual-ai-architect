export interface Tile {
    x: number;
    y: number;
    piece: string | null;
}

const boardSize = 8;

export const createBoard = () => {
    const board = new Array(boardSize).fill(null).map(() => new Array(boardSize).fill(null));

    for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
            board[y][x] = { x, y, piece: null };
        }
    }

    return board;
};

export const placePiece = (board: Tile[][], tile: Tile, piece: string) => {
    tile.piece = piece;
    board[tile.y][tile.x] = tile;
};

export const removePiece = (board: Tile[][], tile: Tile) => {
    tile.piece = null;
    board[tile.y][tile.x] = { x: tile.x, y: tile.y, piece: null };
};

export const isValidMove = (board: Tile[][], start: Tile, end: Tile) => {
    const { x: startX, y: startY } = start;
    const { x: endX, y: endY } = end;

    return startX === endX && startY === endY;
};