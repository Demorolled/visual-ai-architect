import { Game, Room, Item } from './game';

export function runGame() {
  const rooms: Room[] = [
    { name: 'Entrance', description: 'You are standing at the entrance of a dark cave.', items: ['key'], connections: { north: 'Library' } },
    { name: 'Library', description: 'You are in a dimly lit room filled with ancient books.', items: ['sword'], connections: { south: 'Entrance', east: 'Treasure Room' } },
    { name: 'Treasure Room', description: 'You have found the treasure room! It is filled with gold and jewels.', items: ['gold'], connections: { west: 'Library' } }
  ];
  const player = { inventory: [] };
  const game = new Game(rooms, player);
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