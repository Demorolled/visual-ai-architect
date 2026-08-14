export enum Player { X, O }

export class TicTacToe {
    board: string[] = Array(9).fill(' ');

    constructor() {
        this.reset();
    }

    reset() {
        this.board = Array(9).fill(' ');
    }

    placeMark(row: number, col: number, player: Player) {
        if (this.board[row * 3 + col] === ' ') {
            this.board[row * 3 + col] = player === Player.X ? 'X' : 'O';
        }
    }

    hasWinner(): Player | null {
        const winningCombinations = [
            [0, 1, 2],
            [3, 4, 5],
            [6, 7, 8],
            [0, 3, 6],
            [1, 4, 7],
            [2, 5, 8],
            [0, 4, 8],
            [2, 4, 6]
        ];

        for (const [a, b, c] of winningCombinations) {
            if (this.board[a] === this.board[b] && this.board[a] === this.board[c] && this.board[a] !== ' ') {
                return this.board[a] === 'X' ? Player.X : Player.O;
            }
        }

        return null;
    }

    isFull(): boolean {
        return this.board.every((cell) => cell !== ' ');
    }

    isGameOver(): boolean {
        return this.hasWinner() !== null || this.isFull();
    }

    getWinner(): Player | null {
        return this.hasWinner();
    }

    minimax(player: Player, depth: number, alpha: number, beta: number): { row: number; col: number } {
        const winner = this.hasWinner();

        if (winner !== null) {
            return { row: -1, col: -1 };
        }

        if (this.isFull()) {
            return { row: -1, col: -1 };
        }

        let bestMove: { row: number; col: number } = { row: -1, col: -1 };
        let bestScore: number = -Infinity;

        for (let i = 0; i < 9; i++) {
            if (this.board[i] === ' ') {
                this.placeMark(i / 3 | 0, i % 3, player);

                const score = this.minimax(player === Player.X ? Player.O : Player.X, depth + 1, alpha, beta);

                this.board[i] = ' '; // Undo move

                alpha = Math.max(alpha, score);

                if (beta <= alpha) {
                    break;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestMove = { row: i / 3 | 0, col: i % 3 };
                }
            }
        }

        return bestMove;
    }

    bestMove(): number {
        let bestScore = -Infinity;
        let bestMove: number = -1;

        for (let i = 0; i < 9; i++) {
            if (this.board[i] === ' ') {
                this.placeMark(i / 3 | 0, i % 3, Player.X);

                const score = this.minimax(Player.O, 0, -Infinity, Infinity);

                this.board[i] = ' '; // Undo move

                if (score > bestScore) {
                    bestScore = score;
                    bestMove = i;
                }
            }
        }

        return bestMove;
    }
}