// src/ai.js
const getRandomMove = () => {
    const moves = [];
    for (const piece of Piece.all) {
        const validMoves = piece.getValidMoves();
        moves.push(...validMoves);
    }
    return moves[Math.floor(Math.random() * moves.length)];
};

const getRandomMoveWithPiece = () => {
    const piece = Piece.all[Math.floor(Math.random() * Piece.all.length)];
    const moves = piece.getValidMoves();
    return moves[Math.floor(Math.random() * moves.length)];
};

export const AI = {
    movePiece: () => {
        const move = getRandomMove();
        move.execute();
    },
    getRandomMove,
    getRandomMoveWithPiece,
};