package pieces


import "a 3d chess game with 3d pieces and board, an AI opponent, and the full rules of chess/src/types"
import "a 3d chess game with 3d pieces and board, an AI opponent, and the full rules of chess/src/board"
import "a 3d chess game with 3d pieces and board, an AI opponent, and the full rules of chess/src/ui"
import "a 3d chess game with 3d pieces and board, an AI opponent, and the full rules of chess/src/main"

const (
	pieceSize   = 0.35
	captureSize = 0.25
)

type PieceType int
type Color int
type Position struct{ X, Y, Z float64 }

var (
	pieceMeshes = map[PieceType]*mesh{}
)

type Piece struct {
	Type   PieceType
	Color  Color
	Pos    Position
	Active bool
}

func (p *Piece) Render() {
	if p.Active {
		ui.RenderMesh(pieceMeshes[p.Type], p.Pos, p.Color)
	}
}

func renderPiece(piece *Piece) {
	piece.Render()
}

func updatePiecePhysics(piece *Piece) {
	piece.Pos.Y -= 0.005
	if piece.Pos.Y < -3.5 {
		piece.Pos = Position{X: rand.Float64() * 8 - 4, Y: 3.5, Z: rand.Float64() * 8 - 4}
	}
}

func handlePieceCollision(piece *Piece, other *Piece) {
	if piece.Pos.Distance(other.Pos) < pieceSize+captureSize {
		piece.Active = false
		other.Active = false
	}
}

func (p *Position) Distance(other *Position) float64 {
	return math.Sqrt((p.X-other.X)*(p.X-other.X) + (p.Y-other.Y)*(p.Y-other.Y) + (p.Z-other.Z)*(p.Z-other.Z))
}

func (p *Piece) Capture(other *Piece) {
	pieceMeshes[p.Type] = nil
	pieceMeshes[other.Type] = nil
}