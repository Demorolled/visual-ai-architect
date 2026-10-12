import { AIController } from '../ai-opponent/ai-opponent.ts';

type Piece = 'white' | 'black' | null;

export function render(container: HTMLElement) {
  let boardState: Piece[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  let currentPlayer: 'white' | 'black' = 'white';

  const app = document.createElement('div');
  app.className = 'app';
  app.style.maxWidth = '960px';
  app.style.margin = '0 auto';
  app.style.padding = '24px';

  // 3D floating board effect: perspective container + tilted board surface.
  const scene = document.createElement('div');
  scene.className = 'scene';
  scene.style.perspective = '1000px';

  const board = document.createElement('div');
  board.className = 'grid';
  board.style.display = 'grid';
  board.style.gridTemplateColumns = 'repeat(8, 1fr)';
  board.style.gap = '1px';
  board.style.border = '1px solid #333';
  board.style.position = 'relative';
  board.style.transform = 'rotateX(12deg)';
  board.style.transformStyle = 'preserve-3d';

  const cells: HTMLDivElement[] = [];

  function resetBoard(): void {
    boardState = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (row < 3 && (row + col) % 2 === 1) boardState[row][col] = 'white';
        if (row > 4 && (row + col) % 2 === 1) boardState[row][col] = 'black';
      }
    }
    currentPlayer = 'white';
    status.textContent = 'Turn: white';
    drawBoard();
  }

  function drawBoard(): void {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const cell = cells[row * 8 + col];
        const piece = boardState[row][col];
        cell.textContent = piece ? (piece === 'white' ? '●' : '●') : '';
        cell.style.backgroundColor = (row + col) % 2 === 1 ? (piece === 'white' ? '#e8e8e8' : '#333') : '#1a1a2e';
        cell.style.color = piece === 'white' ? '#fff' : '#000';
      }
    }
  }

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.display = 'flex';
      cell.style.alignItems = 'center';
      cell.style.justifyContent = 'center';
      cell.style.fontSize = '24px';
      cell.style.cursor = 'pointer';
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.onclick = () => {
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        if (boardState[r][c] === null && (r + c) % 2 === 1) {
          boardState[r][c] = currentPlayer;
          drawBoard();
          currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
          status.textContent = `Turn: ${currentPlayer}`;
        }
      };
      cells.push(cell);
      board.appendChild(cell);
    }
  }

  const status = document.createElement('div');
  status.className = 'status';
  status.style.marginTop = '12px';
  status.style.fontSize = '14px';
  status.textContent = 'Turn: white';

  const buttons = document.createElement('div');
  buttons.className = 'row';
  buttons.style.marginTop = '12px';
  buttons.style.gap = '8px';

  const newGameBtn = document.createElement('button');
  newGameBtn.className = 'btn';
  newGameBtn.textContent = 'New Game';
  newGameBtn.onclick = resetBoard;

  const aiMoveBtn = document.createElement('button');
  aiMoveBtn.className = 'btn';
  aiMoveBtn.textContent = 'AI Move';
  aiMoveBtn.onclick = () => {
    const ai = new AIController();
    const move = ai.makeMove(boardState, currentPlayer);
    if (move && move.row >= 0 && move.col >= 0) {
      boardState[move.row][move.col] = currentPlayer;
      drawBoard();
      currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
      status.textContent = `Turn: ${currentPlayer}`;
    }
  };

  buttons.appendChild(newGameBtn);
  buttons.appendChild(aiMoveBtn);

  scene.appendChild(board);
  app.appendChild(scene);
  app.appendChild(status);
  app.appendChild(buttons);

  container.appendChild(app);
  resetBoard();
}
