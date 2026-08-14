import { Cell, GameState, Move, GameEvent, GameResult, GameException, Player, Game } from '../types/types.ts';

export function minimax(board: Game, currentLevel: number): { winner: Player['name']; line?: number[] } {
    const winner = board.checkWin();
    if (winner) return { winner: winner.name, line: board.winningLine };
    if (currentLevel === 6) return { winner: null };

    let bestMove: { row: number; col: number } | null = null;
    let bestScore = -Infinity;

    for (const { row, col } of board.getEmptyCells()) {
        const newBoard = board.clone();
        newBoard.makeMove(row, col);
        const result = minimax(newBoard, currentLevel + 1);
        const score = (result.winner === 'O' ? 1 : -1) * (result.line?.length || 0);

        if (score > bestScore) {
            bestScore = score;
            bestMove = { row, col };
        }
    }

    return { winner: bestMove ? 'O' : null, line: bestMove ? board.winningLineFromCell(bestMove) : null };
}