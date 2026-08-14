export function displayBoard(board: string[]) {
  let html = '<table><tbody>';
  for (let i = 0; i < 3; i++) {
    html += '<tr>';
    for (let j = 0; j < 3; j++) {
      html += `<td>${board[i * 3 + j]}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  document.body.innerHTML = html;
}

export function getUserMove(board: string[]): { index: number } {
  let input = prompt('Enter your move (1-9)');
  while (!input || !isValidMove(board, input)) {
    input = prompt('Invalid move, try again (1-9)');
  }
  return { index: parseInt(input) - 1 };
}

function isValidMove(board: string[], input: string): boolean {
  return input.length === 1 && input >= '1' && input <= '9' && board[parseInt(input) - 1] === '';
}