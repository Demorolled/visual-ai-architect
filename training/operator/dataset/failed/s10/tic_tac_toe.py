class TicTacToeBoard:
    def __init__(self):
        self.state = [[' ' for _ in range(3)] for _ in range(3)]

    def print_board(self):
        for row in self.state:
            print('|'.join(row))
            print('-' * 5)

    def is_winning_state(self):
        for row in self.state:
            if row[0] == row[1] == row[2] != ' ':
                return True
        for col in range(3):
            if self.state[0][col] == self.state[1][col] == self.state[2][col] != ' ':
                return True
        if self.state[0][0] == self.state[1][1] == self.state[2][2] != ' ':
            return True
        if self.state[0][2] == self.state[1][1] == self.state[2][0] != ' ':
            return True
        return False

    def make_move(self, row, col, mark):
        if self.state[row][col] == ' ':
            self.state[row][col] = mark
            return True
        return False

class TicTacToeGame:
    def __init__(self):
        self.board = TicTacToeBoard()
        self.current_player = 'X'

    def make_move(self, row, col):
        if self.board.make_move(row, col, self.current_player):
            self.current_player = 'O' if self.current_player == 'X' else 'X'
            return True
        return False

    def get_winner(self):
        if self.board.is_winning_state():
            return self.current_player
        return None

    def get_board_state(self):
        return self.board.state

def tic_tac_toe_game():
    game = TicTacToeGame()
    game.board.print_board()

    for _ in range(9):
        row = int(input("Enter row (0-2): "))
        col = int(input("Enter column (0-2): "))
        if game.make_move(row, col):
            game.board.print_board()
            winner = game.get_winner()
            if winner:
                print(f'{winner} wins!')
                return
        else:
            print('Invalid move. Try again.')

    print('It\'s a draw!')