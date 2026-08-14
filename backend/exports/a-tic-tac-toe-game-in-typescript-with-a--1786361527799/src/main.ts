import { GameState, makeMove, minimax } from './game-logic';

const board = document.querySelector('#board')!;
const game = new GameState();
const turn = 'X';

const play = () => {
    makeMove(game, 'X', 0);
    updateBoard();
    if (game.winner) {
        alert(`Player ${game.winner} wins!`);
        game.reset();
        turn = 'X';
    } else if (game.draw) {
        alert('It\'s a draw!');
        game.reset();
        turn = 'X';
    }
    if (turn === 'O') {
        computerMove();
    }
};

const updateBoard = () => {
    for (let i = 0; i < 9; i++) {
        const square = document.querySelector(`#square-${i}`)!;
        square.textContent = game.board[i];
    }
};

const handleClick = (event: MouseEvent) => {
    const squareId = (event.target as HTMLElement).id;
    if (squareId.startsWith('square-')) {
        const square = parseInt(squareId.slice(7), 10);
        if (game.board[square] === '') {
            makeMove(game, 'O', square);
            updateBoard();
            if (game.winner) {
                alert(`Computer wins!`);
                game.reset();
                turn = 'X';
            }
        }
    }
};

board.addEventListener('click', handleClick);

const computerMove = () => {
    const move = minimax(game, 'O', 5);
    makeMove(game, 'O', move);
    updateBoard();
};