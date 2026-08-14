import { Board, Player, MinMax, makeMove } from './game-logic';

export const startGame = (): void => {
    const board = new Board();
    const player = new Player('X');
    const ai = new MinMax();

    const gameLoop = (): void => {
        if (board.isGameOver()) return;

        if (board.currentPlayer === player.symbol) {
            player.makeMove(board);
        } else {
            const move = ai.makeMove(board);
            makeMove(board, move[0], move[1]);
        }

        updateDisplay(board);
    };

    const updateDisplay = (b: Board): void => {
        const cells = document.querySelectorAll<HTMLDivElement>('.cell');
        cells.forEach((cell, idx) => {
            const value = b.getCell(idx);
            cell.textContent = value === null ? '' : value.toString();
        });
    };

    gameLoop();
    document.addEventListener('click', (e) => {
        if (e.target instanceof HTMLDivElement && e.target.classList.contains('cell')) {
            const idx = parseInt(e.target.getAttribute('data-index') || '0');
            if (board.getCell(idx) === null) {
                makeMove(board, idx, player.symbol);
                gameLoop();
            }
        }
    });
};