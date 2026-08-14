def tic_tac_toe_game():
    from tic_tac_toe import TicTacToeGame
    game = TicTacToeGame()
    game.play_sequence([('X', 0, 0), ('O', 0, 1), ('X', 1, 0), ('O', 1, 1), ('X', 0, 2)])
    board = game.board
    for row in board:
        print(' | '.join(row))
    print('X wins')