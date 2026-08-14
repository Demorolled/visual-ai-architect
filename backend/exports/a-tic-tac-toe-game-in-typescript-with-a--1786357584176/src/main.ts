import { minimax } from './game-logic';
export function playGame() {
    const board: number[] = Array(9).fill(-1);
    let currentPlayer = 1;
    let gameActive = true;

    const updateBoard = (cellIdx: number) => {
        if (board[cellIdx] !== -1 || !gameActive) return;
        board[cellIdx] = currentPlayer;
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        gameActive = minimax(board, 2) !== null;
        return { board, currentPlayer, gameActive };
    };

    return updateBoard;
}