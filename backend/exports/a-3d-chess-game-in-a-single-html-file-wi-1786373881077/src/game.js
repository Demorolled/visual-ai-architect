import { AI } from "./ai.js";

class Game {
    constructor() {
        this.board = [];
        this.turn = "white";
        this.AI = new AI();
        this.setupBoard();
    }

    setupBoard() {
        const boardSize = 8;
        for (let y = 0; y < boardSize; y++) {
            this.board[y] = [];
            for (let x = 0; x < boardSize; x++) {
                this.board[y][x] = new Tile(x, y);
            }
        }
    }

    startGame() {
        this.render();
        this.listenToUserInput();
        this.AI.startPlaying();
    }

    render() {
        // Initialize three.js scene
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        // Add board to scene
        this.board.forEach((row) => row.forEach((tile) => tile.addToScene(scene)));

        // Animation loop
        function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        }
        animate();

        // Move piece animation
        function animatePieceMove(piece, targetTile) {
            const start = piece.position;
            const end = targetTile.position;
            const duration = 1000; // 1 second

            // Move piece smoothly
            const startTransform = new THREE.Matrix4().makeTranslation(start.x, start.y, start.z);
            const endTransform = new THREE.Matrix4().makeTranslation(end.x, end.y, end.z);

            const animation = new THREE.LinearKeyframeTrack(
                "[piece].position",
                [0, 1],
                [startTransform.getTranslation(new THREE.Vector3()), endTransform.getTranslation(new THREE.Vector3())]
            );

            const animationClip = new THREE.AnimationClip("Move", duration, [animation]);
            const mixer = new THREE.AnimationMixer(piece.mesh);
            const action = mixer.clipAction(animationClip);
            action.play();
        }

        // User input listener
        window.addEventListener("click", (event) => {
            const target = new THREE.Vector3(event.clientX, event.clientY, 0);
            camera.unproject(target);
            const clickedTile = this.findTileAt(target);
            if (clickedTile && clickedTile.piece && clickedTile.piece.team === this.turn) {
                clickedTile.piece.moveTo(clickedTile);
                this.turn = this.turn === "white" ? "black" : "white";
                this.AI.makeMove();
            }
        });
    }

    listenToUserInput() {
        document.addEventListener("keydown", (event) => {
            if (event.key === "ArrowUp" && this.turn === "white") {
                this.AI.makeMove();
            }
        });
    }

    findTileAt(point) {
        const x = Math.floor(point.x / 100);
        const y = Math.floor(point.y / 100);
        return this.board[y][x];
    }

    makeMove(piece, targetTile) {
        piece.moveTo(targetTile);
        this.turn = this.turn === "white" ? "black" : "white";
        this.AI.makeMove();
    }
}

export default Game;