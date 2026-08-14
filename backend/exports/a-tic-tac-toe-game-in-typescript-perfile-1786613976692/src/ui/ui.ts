import { Cell, GameState, Move, GameEvent, GameResult, GameException, Player, Game } from '../types/types.ts';

export function renderBoard(container: HTMLElement) {
    const board = document.createElement('div');
    board.className = 'grid';
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('button');
        cell.className = 'cell';
        cell.dataset.index = i.toString();
        cell.addEventListener('click', () => handleCellClick(cell));
        board.appendChild(cell);
    }
    container.appendChild(board);
    document.addEventListener('keydown', handleKeyDown);
}

let currentPlayer: Player = { id: 'X', name: 'X' };
let gameResult: GameResult | null = null;

function handleCellClick(cell: HTMLButtonElement) {
    if (gameResult !== null || cell.textContent !== null) return;
    const index = parseInt(cell.dataset.index!, 10);
    if (index < 0 || index >= 9) return;
    const move: Move = { player: currentPlayer, index };
    handleMove(move);
    currentPlayer = currentPlayer.id === 'X' ? { id: 'O', name: 'O' } : { id: 'X', name: 'X' };
}

function handleKeyDown(event: KeyboardEvent) {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (keys.includes(event.key) && gameResult === null) {
        handleCellClick(document.querySelector(`button[data-index="${keys.indexOf(event.key) + 1}"]`) as HTMLButtonElement);
    }
}

export function handleMove(move: { player: Player; index: number }) {
    if (gameResult !== null) return;
    const cells = document.querySelectorAll('.cell') as NodeListOf<HTMLElement>;
    const winner = checkWin(cells);
    if (winner !== null) {
        gameResult = { winner: winner.id, line: winner.line };
        return;
    }
    if (isDraw(cells)) {
        gameResult = { winner: null, line: null };
        return;
    }
    cells[move.index].textContent = move.player.id;
}

function checkWin(cells: NodeListOf<HTMLElement>): Player | null {
    const lines = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
    ];
    for (const [a, b, c] of lines) {
        const cellA = cells[a] as HTMLButtonElement;
        const cellB = cells[b] as HTMLButtonElement;
        const cellC = cells[c] as HTMLButtonElement;
        if (cellA.textContent === null || cellB.textContent === null || cellC.textContent === null) continue;
        if (cellA.textContent === cellB.textContent && cellB.textContent === cellC.textContent) {
            return { id: cellA.textContent!, name: cellA.textContent! };
        }
    }
    return null;
}

function isDraw(cells: NodeListOf<HTMLElement>): boolean {
    for (const cell of cells) {
        if (cell.textContent === null) return false;
    }
    return true;
}