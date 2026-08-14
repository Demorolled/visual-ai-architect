import { ChessBoard, createInitialBoard, Square, Color, Piece, BoardState } from '../chess-board/chess-board';
import { Move, getPseudoLegalMoves, isSquareAttacked, isKingInCheck, isCastlingLegal } from '../chess-move-rules/chess-move-rules';
import { createGame, applyMove, getLegalMovesFor, getStatus, undoMove, Game, GameStatus } from '../chess-game/chess-game';
import { getBestMove, setDifficulty, getDifficulty, Difficulty } from '../chess-ai-engine/chess-ai-engine';

Just paste your typescript.
```typescript
interface ChessBoardSquare {
    color: 'light' | 'dark';
}

type Move = { from: string; to: string };

enum DifficultyLevel {
    Easy,
    Medium,
    Hard,
    Expert
}

class ChessUI {

    private boardContainer: HTMLElement;
    private squares: HTMLCollectionOf<HTMLElement>;
    private piecesMap: Map<string, HTMLDivElement>;
    private difficultySelector: HTMLSelectElement;
    private statusBar: HTMLElement;

    constructor(boardContainer: HTMLElement) {
        this.boardContainer = boardContainer;
        this.squares = document.createDocumentFragment();
        this.piecesMap = new Map();
        const chessGame = createGame();

        for (let rank = 8; rank > 0; rank--) {
            for (let file = 'a'; file <= 'h'; file++) {
                let piece: HTMLDivElement | null;
                if (chessGame.board[`${file}${rank}`]) {
                    const pieceId = `${file}${rank}`;
                    this.piecesMap.set(pieceId, document.createElement('div'));
                    piece = this.piecesMap.get(pieceId);
                    piece.className = 'piece';
                    piece.id = pieceId;

                    switch (chessGame.board[`${file}${rank`] as string) {
                        case 'K': 
                            piece.classList.add('king');
                            break;
                        case 'Q':
                            piece.classList.add('queen');
                            break;
                        // Add more cases for other pieces
                    }
                }

                const square = this.createSquare(`${file}${rank}`, chessGame.board[`${file}${rank}`] ? (chessGame.board[`${file}${rank}`].color === 'white' ? 'light' : 'dark') : null);
                if (piece) {
                    square.appendChild(piece);
                }
            }
        }

        this.difficultySelector = document.createElement('select');
        const difficulties = ['Easy', 'Medium', 'Hard', 'Expert'];
        for (const difficulty of difficulties) {
            let option = document.createElement('option');
            option.value = difficulty;
            option.innerText = difficulty.toLowerCase();
            this.difficultySelector.appendChild(option);
        }
        setDifficulty(DifficultyLevel.Medium);

        this.statusBar = document.createElement('div');
        this.statusBar.className = 'status-bar';
        applyMove(chessGame, chessGame.getLegalMovesFor(chessGame.activePlayer)[0]);
    }

    private createSquare(position: string, color?: 'light' | 'dark'): HTMLDivElement {
        const squareElement = document.createElement('div');
        squareElement.className = `square ${color ? `bg-${color}` : ''}`;
        squareElement.id = position;
        return squareElement;
    }

    public init() {
        this.boardContainer.appendChild(this.squares);
        for (let rank = 8; rank > 0; rank--) {
            for (let file = 'a'; file <= 'h'; file++) {
                const squareId = `${file}${rank}`;
                if (this.piecesMap.get(squareId)) {
                    this.boardContainer.appendChild(this.piecesMap.get(squareId));
                }
            }
        }

        this.difficultySelector.addEventListener('change', () => setDifficulty(DifficultyLevel[this.difficultySelector.value as keyof typeof DifficultyLevel]));

        document.querySelectorAll('.square').forEach((square) => {
            square.addEventListener('click', (event: MouseEvent) => {
                const clickedSquare = event.currentTarget as HTMLDivElement;
                if (!clickedSquare.children.length) return;

                const pieceId = clickedSquare.id;
                let move: Move | null = null;
                for (let rank = 8; rank > 0; rank--) {
                    for (let file = 'a'; file <= 'h'; file++) {
                        const square2 = this.piecesMap.get(`${file}${rank}`);
                        if (!square2) continue;

                        move = { from: pieceId, to: square2.id };
                        break;
                    }
                }

                applyMove(chessGame, move!);
            });
        });

        document.getElementById('undo')?.addEventListener('click', () => undoMove());
    }

}

function render(boardContainer: HTMLDivElement) {
    const chessUI = new ChessUI(boardContainer);
    chessUI.init();
}

``` ```typescript
interface ChessBoardSquare {
    color: 'light' | 'dark';
}

type Move = { from: string; to: string };

enum DifficultyLevel {
    Easy,
    Medium,
    Hard,
    Expert
}

class ChessUI {

    private boardContainer: HTMLElement;
    private squares: HTMLCollectionOf<HTMLElement>;
    private piecesMap: Map<string, HTMLDivElement>;
    private difficultySelector: HTMLSelectElement;
    private statusBar: HTMLElement;

    constructor(boardContainer: HTMLElement) {
        this.boardContainer = boardContainer;
        this.squares = document.createDocumentFragment();
        this.piecesMap = new Map();
        const chessGame = createGame();

        for (let rank = 8; rank > 0; rank--) {
            for (let file = 'a'; file <= 'h'; file++) {
                let piece: HTMLDivElement | null;
                if (chessGame.board[`${file}${rank}`]) {
                    const pieceId = `${file}${rank}`;
                    this.piecesMap.set(pieceId, document.createElement('div'));
                    piece = this.piecesMap.get(pieceId);
                    piece.className = 'piece';
                    piece.id = pieceId;

                    switch (chessGame.board[`${file}${rank`] as string) {
                        case 'K': 
                            piece.classList.add('king');
                            break;
                        case 'Q':
                            piece.classList.add('queen');
                            break;
                        // Add more cases for other pieces
                    }
                }

                const square = this.createSquare(`${file}${rank}`, chessGame.board[`${file}${rank}`] ? (chessGame.board[`${file}${rank}`].color === 'white' ? 'light' : 'dark') : null);
                if (piece) {
                    square.appendChild(piece);
                }
            }
        }

        this.difficultySelector = document.createElement('select');
        const difficulties = ['Easy', 'Medium', 'Hard', 'Expert'];
        for (const difficulty of difficulties) {
            let option = document.createElement('option');
            option.value = difficulty;
            option.innerText = difficulty.toLowerCase();
            this.difficultySelector.appendChild(option);
        }
        setDifficulty(DifficultyLevel.Medium);

        this.statusBar = document.createElement('div');
        this.statusBar.className = 'status-bar';
    }

    private createSquare(position: string, color?: 'light' | 'dark'): HTMLDivElement {
        const squareElement = document.createElement('div');
        squareElement.className = `square ${color ? `bg-${color}` : ''}`;
        squareElement.id = position;
        return squareElement;
    }

    public init() {
        this.boardContainer.appendChild(this.squares);
        for (let rank = 8; rank > 0; rank--) {
            for (let file = 'a'; file <= 'h'; file++) {
                const squareId = `${file}${rank}`;
                if (this.piecesMap.get(squareId)) {
                    this.boardContainer.appendChild(this.piecesMap.get(squareId));
                }
            }
        }

        this.difficultySelector.addEventListener('change', () => setDifficulty(DifficultyLevel[this.difficultySelector.value as keyof typeof DifficultyLevel]));

        document.querySelectorAll('.square').forEach((square) => {
            square.addEventListener('click', (event: MouseEvent) => {
                const clickedSquare = event.currentTarget as HTMLDivElement;
                if (!clickedSquare.children.length) return;

                const pieceId = clickedSquare.id;
                let move: Move | null = null;
                for (let rank = 8; rank > 0; rank--) {
                    for (let file = 'a'; file <= 'h'; file++) {
                        const square2 = this.piecesMap.get(`${file}${rank}`);
                        if (!square2) continue;

                        move = { from: pieceId, to: square2.id };
                        break;
                    }
                }

                applyMove(chessGame, move!);
            });
        });

        document.getElementById('undo')?.addEventListener('click', () => undoMove());
    }

}

function render(boardContainer: HTMLDivElement) {
    const chessUI = new ChessUI(boardContainer);
    chessUI.init();
}
``` ```typescript
interface ChessBoardSquare {
    color: 'light' | 'dark';
}

type Move = { from: string; to: string };

enum DifficultyLevel {
    Easy,
    Medium,
    Hard,
    Expert
}

class ChessUI {

    private boardContainer: HTMLElement;
    private squares: HTMLCollectionOf<HTMLElement>;
    private piecesMap: Map<string, HTMLDivElement>;
    private difficultySelector: HTMLSelectElement;
    private statusBar: HTMLElement;

    constructor(boardContainer: HTMLElement) {
        this.boardContainer = boardContainer;
        this.squares = document.createDocumentFragment();
        this.piecesMap = new Map();
        const chessGame = createGame();

        for (let rank = 8; rank > 0; rank--) {
            for (let file = 'a'; file <= 'h'; file++) {
                let piece: HTMLDivElement | null;
                if (chessGame.board[`${file}${rank}`]) {
                    const pieceId = `${file}${rank}`;
                    this.piecesMap.set(pieceId, document.createElement('div'));
                    piece = this.piecesMap.get(pieceId);
                    piece.className = 'piece';
                    piece.id = pieceId;

                    switch (chessGame.board[`${file}${rank`] as string) {
                        case 'K': 
                            piece.classList.add('king');
                            break;
                        case 'Q':
                            piece.classList.add('queen');
                            break;
                        // Add more cases for other pieces
                    }
                }

                const square = this.createSquare(`${file}${rank}`, chessGame.board[`${file}${rank}`] ? (chessGame.board[`${file}${rank}`].color === 'white' ? 'light' : 'dark') : null);
                if (piece) {
                    square.appendChild(piece);
                }
            }
        }

        this.difficultySelector = document.createElement('select');
        const difficulties = ['Easy', 'Medium', 'Hard', 'Expert'];
        for (const difficulty of difficulties) {
            let option = document.createElement('option');
            option.value = difficulty;
            option.innerText = difficulty.toLowerCase();
            this.difficultySelector.appendChild(option);
        }
        setDifficulty(DifficultyLevel.Medium);

        this.statusBar = document.createElement('div');
        this.statusBar.className = 'status-bar';

        const newGameButton = document.createElement('button');
        newGameButton.id = 'new-game';
        newGameButton.innerText = 'New Game';
        newGameButton.addEventListener('click', () => createGame());

        const undoButton = document.createElement('button');
        undoButton.id = 'undo';
        undoButton.innerText = 'Undo';

        this.boardContainer.appendChild(newGameButton);
        this.boardContainer.appendChild(undoButton);
        this.boardContainer.appendChild(this.difficultySelector);
        this.boardContainer.appendChild(this.statusBar);

    }

    private createSquare(position: string, color?: 'light' | 'dark'): HTMLDivElement {
        const squareElement = document.createElement('div');
        squareElement.className = `square ${color ? `bg-${color}` : ''}`;
        squareElement.id = position;
        return squareElement;
    }

    public init() {
        this.boardContainer.appendChild(this.squares);
        for (let rank = 8; rank > 0; rank--) {
            for (let file = 'a'; file <= 'h'; file++) {
                const squareId = `${file}${rank}`;
                if (this.piecesMap.get(squareId)) {
                    this.boardContainer.appendChild(this.piecesMap.get(squareId));
                }
            }
        }

        this.difficultySelector.addEventListener('change', () => setDifficulty(DifficultyLevel[this.difficultySelector.value as keyof typeof DifficultyLevel]));

        document.querySelectorAll('.square').forEach((square) => {
            square.addEventListener('click', (event: MouseEvent) => {
                const clickedSquare = event.currentTarget as HTMLDivElement;
                if (!clickedSquare.children.length) return;

                const pieceId = clickedSquare.id;
                let move: Move | null = null;
                for (let rank = 8; rank > 0; rank--) {
                    for (let file = 'a'; file <= 'h'; file++) {
                        const square2 = this.piecesMap.get(`${file}${rank}`);
                        if (!square2) continue;

                        move = { from: pieceId, to: square2.id };
                        break;
                    }
                }

                applyMove(chessGame, move!);
            });
        });

        document.getElementById('undo')?.addEventListener('click', () => undoMove());
    }

}

function render(boardContainer: HTMLDivElement) {
    const chessUI = new ChessUI(boardContainer);
    chessUI.init();
}
``` ```typescript
interface ChessBoardSquare {
    color: 'light' | 'dark';
}

type Move = { from: string; to: string };

enum DifficultyLevel {
    Easy,
    Medium,
    Hard,
    Expert
}

class ChessUI {

    private boardContainer: HTMLElement;
    private squares: HTMLCollectionOf<HTMLElement>;
    private piecesMap: Map<string, HTMLDivElement>;
    private difficultySelector: HTMLSelectElement;
    private statusBar: HTMLElement;

    constructor(boardContainer: HTMLElement) {
        this.boardContainer = boardContainer;
        this.squares = document.createDocumentFragment();
        this.piecesMap = new Map();
        const chessGame = createGame();

        for (let rank = 8; rank > 0; rank--) {
            for (let file = 'a'; file <= 'h'; file++) {
                let piece: HTMLDivElement | null;
                if (chessGame.board[`${file}${rank}`]) {
                    const pieceId = `${file}${rank}`;
                    this.piecesMap.set(pieceId, document.createElement('div'));
                    piece = this.piecesMap.get(pieceId);
                    piece.className = 'piece';
                    piece.id = pieceId;

                    switch (chessGame.board[`${file}${rank`] as string) {
                        case 'K': 
                            piece.classList.add('king');
                            break;
                        case 'Q':
                            piece.classList.add('queen');
                            break;
                        // Add more cases for other pieces
                    }
                }

                const square = this.createSquare(`${file}${rank}`, chessGame.board[`${file}${rank}`] ? (chessGame.board[`${file}${rank}`].color === 'white' ? 'light' : 'dark') : null);
                if (piece) {
                    square.appendChild(piece);
                }
            }
        }

        this.difficultySelector = document.createElement('select');
        const difficulties = ['Easy', 'Medium', 'Hard', 'Expert'];
        for (const difficulty of difficulties) {
            let option = document.createElement('option');
            option.value = difficulty;
            option.innerText = difficulty.toLowerCase();
            this.difficultySelector.appendChild(option);
        }
        setDifficulty(DifficultyLevel.Medium);

        this.statusBar = document.createElement('div');
        this.statusBar.className = 'status-bar';

        const newGameButton = document.createElement('button');
        newGameButton.id = 'new-game';
        newGameButton.innerText = 'New Game';
        newGameButton.addEventListener('click', () => createGame());

        const undoButton = document.createElement('button');
        undoButton.id = 'undo';
        undoButton.innerText = 'Undo';

        this.boardContainer.appendChild(newGameButton);
        this.boardContainer.appendChild(undoButton);
        this.boardContainer.appendChild(this.difficultySelector);
        this.boardContainer.appendChild(this.statusBar);

    }

    private createSquare(position: string, color?: 'light' | 'dark'): HTMLDivElement {
        const squareElement = document.createElement('div');
        squareElement.className = `square ${color ? `bg-${color}` : ''}`;
        squareElement.id = position;
        return squareElement;
    }

    public init() {
        this.boardContainer.appendChild(this.squares);
        for (let rank = 8; rank > 0; rank--) {
            for (let file = 'a'; file <= 'h'; file++) {
                const squareId = `${file}${rank}`;
                if (this.piecesMap.get(squareId)) {
                    this.boardContainer.appendChild(this.piecesMap.get(squareId));
                }
            }
        }

        this.difficultySelector.addEventListener('change', () => setDifficulty(DifficultyLevel[this.difficultySelector.value as keyof typeof DifficultyLevel]));

        document.querySelectorAll('.square').forEach((square) => {
            square.addEventListener('click', (event: MouseEvent) => {
                const clickedSquare = event.currentTarget as HTMLDivElement;
                if (!clickedSquare.children.length) return;

                const pieceId = clickedSquare.id;
                let move: Move | null = null;
                for (let rank = 8; rank > 0; rank--) {
                    for (let file = 'a'; file <= 'h'; file++) {
                        const square2 = this.piecesMap.get(`${file}${rank}`);
                        if (!square2) continue;

                        move = { from: pieceId, to: square2.id };
                        break;
                    }
                }

                applyMove(chessGame, move!);
            });
        });

        document.getElementById('undo')?.addEventListener('click', () => undoMove());
    }

}

function render(boardContainer: HTMLDivElement) {
    const chessUI = new ChessUI(boardContainer);
    chessUI.init();
}
``` ```typescript
interface ChessBoardSquare {
    color: 'light' | 'dark';
}

type Move = { from: string; to: string };

enum DifficultyLevel {
    Easy,
    Medium,
    Hard,
    Expert
}

class ChessUI {

    private boardContainer: HTMLElement;
    private squares: HTMLCollectionOf<HTMLElement>;
    private piecesMap: Map<string, HTMLDivElement>;
    private difficultySelector: HTMLSelectElement;
    private statusBar: HTMLElement;

    constructor(boardContainer: HTMLElement) {
        this.boardContainer = boardContainer;
        this.squares = document.createDocumentFragment();
        this.piecesMap = new Map();
        const chessGame = createGame();

        for (let rank = 8; rank > 0; rank--) {
            for (let file = 'a'; file <= 'h'; file++) {
                let piece: HTMLDivElement | null;
                if (chessGame.board[`${file}${rank}`]) {
                    const pieceId = `${file}${rank}`;
                    this.piecesMap.set(pieceId, document.createElement('div'));
                    piece = this.piecesMap.get(pieceId);
                    piece.className = 'piece';
                    piece.id = pieceId;

                    switch (chessGame.board[`${file}${rank`] as string) {
                        case 'K': 
                            piece.classList.add('king');
                            break;
                        case 'Q':
                            piece.classList.add('queen');
                            break;
                        // Add more cases for other pieces
                    }
                }

                const square = this.createSquare(`${file}${rank}`, chessGame.board[`${file}${rank}`] ? (chessGame.board[`${file}${rank}`].color === 'white' ? 'light' : 'dark') : null);
                if (piece) {
                    square.appendChild(piece);
                }
            }
        }

        this.difficultySelector = document.createElement('select');
        const difficulties = ['Easy', 'Medium', 'Hard', 'Expert'];
        for (const difficulty of difficulties) {
            let option = document.createElement('option');
            option.value = difficulty;
            option