import { TicTacToe, Player, minimax } from './game-logic';

export function run() {
    const game = new TicTacToe();
    const turns = ['x', 'o'];

    function displayBoard() {
        console.log(game.board.map(row => row.join(' | ')).join('
'));
        console.log('-------------');
    }

    function getUserInput() {
        const input = prompt('Enter row (0-2) and column (0-2) separated by space:');
        if (input) {
            const [row, col] = input.split(' ').map(Number);
            if (row >= 0 && row < 3 && col >= 0 && col < 3 && game.board[row][col] === '') {
                game.placeMark(row, col, Player.X);
                turns[0] = turns[1];
                turns[1] = turns[0];
            }
        }
    }

    function main() {
        displayBoard();
        while (!game.isGameOver()) {
            getUserInput();
            displayBoard();
            if (game.isGameOver()) break;
            const move = minimax(game, Player.O);
            game.placeMark(move.row, move.col, Player.O);
            displayBoard();
        }
        console.log(game.getWinner() ? `${game.getWinner()} wins!` : 'Tie game');
    }

    main();
}