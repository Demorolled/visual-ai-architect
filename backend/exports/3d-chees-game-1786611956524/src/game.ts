export function startGame() {
	const canvas = document.createElement('canvas');
	document.body.appendChild(canvas);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Failed to get canvas context');
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	const SIZE = 32;
	const ENEMIES = 5;
	const player = { x: canvas.width / 2, y: canvas.height / 2, dir: { x: 0, y: 0 }, speed: SIZE * 5 };
	const enemies = Array.from({ length: ENEMIES }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, target: { x: canvas.width / 2, y: canvas.height / 2 } }));
	const cheese = { x: canvas.width / 2 + SIZE, y: canvas.height / 2 + SIZE };
	const keys = { up: false, down: false, left: false, right: false };
	let running = true;

	function update() {
		if (!running) return;
		input();
		player.dir = { x: 0, y: 0 };
		if (keys.up) player.dir.y -= 1;
		if (keys.down) player.dir.y += 1;
		if (keys.left) player.dir.x -= 1;
		if (keys.right) player.dir.x += 1;
		player.x += player.dir.x * player.speed * 0.0166;
		player.y += player.dir.y * player.speed * 0.0166;
		player.x = Math.max(SIZE, Math.min(canvas.width - SIZE, player.x));
		player.y = Math.max(SIZE, Math.min(canvas.height - SIZE, player.y));
		const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
		for (let i = 0; i < enemies.length; i++) {
			const e = enemies[i];
			e.target = cheese;
			e.x += (e.target.x - e.x) * 200 * 0.0166;
			e.y += (e.target.y - e.y) * 200 * 0.0166;
			if (dist(player, e) < SIZE * 2) enemies.splice(i, 1);
		}
	}

	function render() {
		ctx.fillStyle = 'black';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = 'white';
		ctx.fillRect(player.x, player.y, SIZE, SIZE);
		ctx.fillStyle = 'yellow';
		ctx.fillRect(cheese.x, cheese.y, SIZE, SIZE);
		for (const e of enemies) ctx.fillRect(e.x, e.y, SIZE, SIZE);
	}

	function input() {
		const keyDown = (key: string) => keys[key] = true;
		const keyUp = (key: string) => keys[key] = false;
		window.addEventListener('keydown', (e) => {
			switch (e.key) {
				case 'ArrowUp': case 'w': keyDown('up'); break;
				case 'ArrowDown': case 's': keyDown('down'); break;
				case 'ArrowLeft': case 'a': keyDown('left'); break;
				case 'ArrowRight': case 'd': keyDown('right'); break;
			}
		});
		window.addEventListener('keyup', (e) => {
			switch (e.key) {
				case 'ArrowUp': case 'w': keyUp('up'); break;
				case 'ArrowDown': case 's': keyUp('down'); break;
				case 'ArrowLeft': case 'a': keyUp('left'); break;
				case 'ArrowRight': case 'd': keyUp('right'); break;
			}
		});
	}

	function main() {
		update();
		render();
		requestAnimationFrame(main);
	}
	input();
	main();
}