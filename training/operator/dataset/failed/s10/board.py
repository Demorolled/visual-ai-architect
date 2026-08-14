from typing import NamedTuple

class TicTacToeBoard:
    def __init__(self):
        self.board = [[None] * 3 for _ in range(3)]

    def _render_row(self, row):
        return '|'.join((' ' if cell is None else cell) for cell in row)

    def render(self):
        return '\n'.join(self._render_row(row) for row in self.board)

    def place(self, x, y, player):
        if 0 <= x < 3 and 0 <= y < 3 and self.board[y][x] is None:
            self.board[y][x] = player
            return True
        return False

    def check_win(self):
        lines = []
        for row in self.board: lines.append(row)
        for col in zip(*self.board): lines.append(col)
        lines.append([self.board[i][i] for i in range(3)])
        lines.append([self.board[i][2 - i] for i in range(3)])
        for line in lines:
            if line.count(line[0]) == 3 and line[0] is not None:
                return line[0]
        return None

    def is_full(self):
        return all(cell is not None for row in self.board for cell in row)