let selectedPiece = null;
let draggedPiece = null;
let dragOffset = { x: 0, y: 0 };
let dragTarget = null;

function handleMouseDown(event) {
    const target = event.target;
    if (target.classList.contains('chess-piece')) {
        selectedPiece = target;
        draggedPiece = selectedPiece;
        dragOffset = {
            x: event.clientX - selectedPiece.offsetLeft,
            y: event.clientY - selectedPiece.offsetTop
        };
        selectedPiece.style.zIndex = '1000';
    }
}

function handleMouseMove(event) {
    if (selectedPiece) {
        selectedPiece.style.left = (event.clientX - dragOffset.x) + 'px';
        selectedPiece.style.top = (event.clientY - dragOffset.y) + 'px';
        dragTarget = getTargetSquare(event.clientX, event.clientY);
    }
}

function handleMouseUp(event) {
    if (selectedPiece) {
        selectedPiece.style.zIndex = '1';
        if (dragTarget) {
            movePiece(selectedPiece, dragTarget);
        }
        selectedPiece = null;
        draggedPiece = null;
    }
}

function getTargetSquare(x, y) {
    // Logic to determine the target square based on the mouse position
    // This could be based on the grid layout or any other criteria
    // Return the target square or null if none is found
    return { x, y };
}

function movePiece(piece, target) {
    // Logic to move the piece to the target square
    // This could involve updating the piece's position, checking for captures, etc.
    // The exact implementation would depend on the game logic
    piece.style.left = target.x + 'px';
    piece.style.top = target.y + 'px';
}