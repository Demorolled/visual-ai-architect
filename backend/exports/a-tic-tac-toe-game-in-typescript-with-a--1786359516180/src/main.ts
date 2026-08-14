import { makeMove, isWinningMove, getBestMove, isGameOver, getGameState } from './game-logic';
const board = Array(9).fill(0);
let currentPlayer = 1;

function play() {
    if (!isGameOver(board)) {
        const move = isWinningMove(board, currentPlayer, -currentPlayer) ? getBestMove(board, currentPlayer) : getBestMove(board, -currentPlayer);
        board = makeMove(board, currentPlayer, move);
        console.log('Player', currentPlayer, 'moves to', move);
        currentPlayer = -currentPlayer;
    }
}

play();

function isGameOver(board: number[]): boolean {
    return getGameState(board) !== 0;
}