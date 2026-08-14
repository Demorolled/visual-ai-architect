import { ChessBoard, createInitialBoard, Square, Color, Piece, BoardState } from '../chess-board/chess-board';
import { Move, getPseudoLegalMoves, isSquareAttacked, isKingInCheck, isCastlingLegal } from '../chess-move-rules/chess-move-rules';

// chess-ai-engine.ts


export interface AIOptions {
  depth: number;
  maxDepth: number;
}

export function getBestMove(board: ChessBoard, color: Color, options?: AIOptions): Move | null {
  const defaults: AIOptions = { depth: 2, maxDepth: 4 };
  const realOptions = { ...defaults, ...options };

  // Validate input
  if (realOptions.depth < 1 || realOptions.depth > realOptions.maxDepth) {
    return null;
  }

  const root: Node = {
    score: 0,
    children: [],
    depth: realOptions.depth,
    moves: [] as Move[],
    color: color,
  };

  const initialScore = evaluateBoard(board);
  root.score = initialScore;

  const moves = getPseudoLegalMoves(board, color);
  for (const move of moves) {
    const child = createChildNode(board, move, color);
    if (child !== null) {
      root.children.push(child);
    }
  }

  // Minimax with alpha-beta pruning
  const alpha = -Infinity;
  const beta = Infinity;
  const bestMove = minimax(root, alpha, beta, 0);

  // Apply best move to the board
  const bestNode = root.children.find((c) => c.score === bestMove.score);
  if (bestNode !== null) {
    for (const move of bestNode.moves) {
      board.makeMove(move);
      return move;
    }
  }

  return null;
}

function minimax(node: Node, alpha: number, beta: number, depth: number): Node {
  if (depth === 0 || node.children.length === 0) {
    return node;
  }

  const bestNode = depth === 0 ? node : { ...node };
  const bestMove = depth === 0 ? null : { from: '', to: '' };

  for (const child of node.children) {
    const result = minimax(child, alpha, beta, depth - 1);
    if (result.score > bestNode.score) {
      bestNode.score = result.score;
      bestMove = { from: result.moves[0].from, to: result.moves[0].to };
    }

    if (depth === 0) {
      node.children.push(result);
    }

    alpha = Math.max(alpha, result.score);
    if (beta <= alpha) break;
  }

  if (depth === 0) {
    return { ...node, moves: [bestMove] };
  }

  return bestNode;
}

function createChildNode(board: ChessBoard, move: Move, color: Color): Node | null {
  if (isCastlingLegal(board, move)) {
    const newBoard = board.clone();
    newBoard.makeMove(move);
    const score = evaluateBoard(newBoard);
    return { score, moves: [move], depth: 1 };
  }

  const newBoard = board.clone();
  newBoard.makeMove(move);
  const pseudoLegalMoves = getPseudoLegalMoves(newBoard, color);
  if (pseudoLegalMoves.length === 0) {
    return null;
  }

  const score = evaluateBoard(newBoard);
  return { score, moves: pseudoLegalMoves, depth: 1 };
}

function evaluateBoard(board: ChessBoard): number {
  const materialValues: Record<string, number> = {
    pawn: 100,
    knight: 320,
    bishop: 330,
    rook: 500,
    queen: 900,
    king: 20000,
  };

  let score = 0;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board.getPiece(file, rank);
      if (piece === null) continue;

      const value = materialValues[piece.type.toLowerCase()];
      if (piece.color === Color.white) {
        score += value;
      } else {
        score -= value;
      }
    }
  }

  // Add positional bonuses (simple example)
  const whiteKing = board.getPieceByType(Piece.king, Color.white);
  const blackKing = board.getPieceByType(Piece.king, Color.black);

  if (whiteKing !== null && blackKing !== null) {
    const whiteKingPos = whiteKing.square;
    const blackKingPos = blackKing.square;

    const whiteKingRank = whiteKingPos.rank;
    const whiteKingFile = whiteKingPos.file;
    const blackKingRank = blackKingPos.rank;
    const blackKingFile = blackKingPos.file;

    const whiteKingDistance = Math.abs(whiteKingRank - blackKingRank) + Math.abs(whiteKingFile - blackKingFile);
    const blackKingDistance = Math.abs(blackKingRank - whiteKingRank) + Math.abs(blackKingFile - whiteKingFile);

    if (whiteKingDistance < 3) {
      score += 500;
    } else if (blackKingDistance < 3) {
      score -= 500;
    }
  }

  return score;
}

// Helper type
interface Node {
  score: number;
  moves: Move[];
  depth: number;
  children: Node[];
}