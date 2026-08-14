package board


import "a 3d chess game with 3d pieces and board, an AI opponent, and the full rules of chess/src/types"
import "a 3d chess game with 3d pieces and board, an AI opponent, and the full rules of chess/src/ui"
import "a 3d chess game with 3d pieces and board, an AI opponent, and the full rules of chess/src/ai"
import "a 3d chess game with 3d pieces and board, an AI opponent, and the full rules of chess/src/game"
import "a 3d chess game with 3d pieces and board, an AI opponent, and the full rules of chess/src/main"

type Move struct {
    From Position
    To   Position
    Captured Piece
}

type BoardState struct {
    Pieces [8][8]Piece
    Turn   Color
    CastlingRights uint8
    EnPassantTarget Position
    HalfMoveClock int
    FullMoveNumber int
}

func isMoveLegal(move Move, board BoardState) bool {
    // Implementation of move legality checks
}

func applyMove(move Move, board BoardState) (BoardState, error) {
    // Apply the move to the board and return the new state
}

func getPieceAt(pos Position, board BoardState) Piece {
    return board.Pieces[pos.Row][pos.Col]
}

func isCheck(board BoardState) bool {
    // Check if the current player is in check
}

func isCheckmate(board BoardState) bool {
    // Check if the current player is in checkmate
}

func isStalemate(board BoardState) bool {
    // Check if the game is a stalemate
}

func getLegalMoves(board BoardState) []Move {
    // Generate all legal moves for the current player
}

func CloneBoardState(board BoardState) BoardState {
    // Create a deep copy of the board state
}