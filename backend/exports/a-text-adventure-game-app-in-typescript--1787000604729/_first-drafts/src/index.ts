import { Game, Room, Item } from '../game/game.ts';

export function runGame() {
  const game = new Game();
  const stdin = process.stdin;
  const stdout = process.stdout;

  stdin.on('data', (data) => {
    const command = data.toString().trim();
    const result = game.handleCommand(command);
    stdout.write(result + '\n');
  });

  stdout.write('Welcome to the Text Adventure Game!\n');
  stdout.write('Type "look" to see your surroundings, "take [item]" to pick up an item, and "move [direction]" to go somewhere.\n');
}