export function solveSudoku(grid: number[][]): boolean {
  if (grid.length !== 9 || grid.some(row => row.length !== 9)) return false;

  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] === 0) {
        for (let num = 1; num <= 9; num++) {
          if (isValid(grid, row, col, num)) {
            grid[row][col] = num;
            if (solveSudoku(grid)) return true;
            grid[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

export function validateGrid(grid: number[][]): boolean {
  if (grid.length !== 9 || grid.some(row => row.length !== 9)) return false;

  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] < 0 || grid[row][col] > 9) return false;
      if (!isValid(grid, row, col, grid[row][col])) return false;
    }
  }
  return true;
}

function isValid(grid: number[][], row: number, col: number, num: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (grid[row][i] === num || grid[i][col] === num) return false;
    const boxRow = Math.floor(row / 3) * 3 + Math.floor(i / 3);
    const boxCol = Math.floor(col / 3) * 3 + i % 3;
    if (grid[boxRow][boxCol] === num) return false;
  }
  return true;
}