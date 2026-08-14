 ```typescript
type Piece = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type BoardState = Record<string, Piece>;

const initialSetup: BoardState = {
    a1: 'R', b1: 'N', c1: 'B', d1: 'Q', e1: 'K', f1: 'B', g1: 'N', h1: 'R',
    a2: 'P', b2: 'P', c2: 'P', d2: 'P', e2: 'P', f2: 'P', g2: 'P', h2: 'P',
    a8: 'r', b8: 'n', c8: 'b', d8: 'q', e8: 'k', f8: 'b', g8: 'n', h8: 'r',
    a7: 'p', b7: 'p', c7: 'p', d7: 'p', e7: 'p', f7: 'p', g7: 'p', h7: 'p'
};

let boardState: BoardState = initialSetup;
let turn: 1 | -1 = 1;

function applyMove(from: string, to: string): void {
    if (!boardState[from] || !boardState[to]) throw new Error('Invalid move');
    const piece = boardState[from];
    delete boardState[from];
    boardState[to] = piece;
    turn *= -1;
}

function serialize(): string {
    let fen = '';
    for (let rank = 8; rank > 0; rank--) {
        let count = 0;
        for (let file = 'a'; file <= 'h'; file++) {
            const square = `${file}${rank}`;
            if (!boardState[square]) {
                count++;
                continue;
            }
            if (count) fen += count.toString();
            fen += boardState[square];
            count = 0;
        }
        if (count) fen += count.toString();
        fen += '/';
    }
    return fen.slice(0, -1);
}

function parse(fen: string): void {
    let rank = 8;
    for (let file = 'a'; file <= 'h'; file++) {
        const square = `${file}${rank}`;
        if (!fen) break;
        const piece = fen[0];
        fen = fen.slice(1);
        boardState[square] = piece;
        if (piece === '/') continue;
        rank--;
    }
}

function isMoveValid(from: string, to: string): boolean {
    // Basic validation logic
    if (!boardState[from]) return false;
    const piece = boardState[from];
    const fromFile = from[0], fromRank = parseInt(from.slice(1), 10);
    const toFile = to[0], toRank = parseInt(to.slice(1), 10);

    // Simple checks for basic moves
    if (Math.abs(fromFile.charCodeAt(0) - toFile.charCodeAt(0)) > 2 || Math.abs(fromRank - toRank) > 2) return false;
    if (piece === 'P' && from[0] !== to[0]) return false;

    // More complex validation would go here
    return true;
}

// Example usage:
applyMove('e2', 'e4');
console.log(serialize());
``` ```typescript
function applyMove(from: string, to: string): void {
    if (!boardState[from] || !boardState[to]) throw new Error('Invalid move');
    const piece = boardState[from];
    delete boardState[from];
    boardState[to] = piece;
    turn *= -1;
}

function serialize(): string {
    let fen = '';
    for (let rank = 8; rank > 0; rank--) {
        let count = 0;
        for (let file = 'a'; file <= 'h'; file++) {
            const square = `${file}${rank}`;
            if (!boardState[square]) {
                count++;
                continue;
            }
            if (count) fen += count.toString();
            fen += boardState[square];
            count = 0;
        }
        if (count) fen += count.toString();
        fen += '/';
    }
    return fen.slice(0, -1);
}

function parse(fen: string): void {
    let rank = 8;
    for (let file = 'a'; file <= 'h'; file++) {
        const square = `${file}${rank}`;
        if (!fen) break;
        const piece = fen[0];
        fen = fen.slice(1);
        boardState[square] = piece;
        if (piece