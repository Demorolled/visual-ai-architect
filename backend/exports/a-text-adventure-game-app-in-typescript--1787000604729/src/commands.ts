import { Game, Room, Item } from '../game.ts';

export function processCommand(game: Game, command: string, args: string[]): void {
  switch (command) {
    case 'take':
      if (args.length === 0) {
        console.log('What do you want to take?');
        return;
      }
      const itemToTake = args.join(' ');
      const room = game.currentRoom;
      const item = room.items.find(i => i.name.toLowerCase() === itemToTake.toLowerCase());
      if (!item) {
        console.log(`I don't see a "${itemToTake}" here.`);
        return;
      }
      game.player.inventory.push(item);
      room.items = room.items.filter(i => i.name !== item.name);
      console.log(`You took the ${item.name}.`);
      break;
    case 'move':
      if (args.length === 0) {
        console.log('Where do you want to go?');
        return;
      }
      const direction = args.join(' ');
      const nextRoom = room.exits[direction];
      if (!nextRoom) {
        console.log(`You can't go that way.`);
        return;
      }
      game.currentRoom = nextRoom;
      console.log(`You moved ${direction}.`);
      break;
    case 'look':
      const currentRoom = game.currentRoom;
      console.log(`You are in ${currentRoom.name}.`);
      console.log(currentRoom.description);
      if (currentRoom.items.length > 0) {
        console.log(`Items here: ${currentRoom.items.map(i => i.name).join(', ')}`);
      }
      break;
    default:
      console.log('Unknown command. Type "help" for a list of commands.');
      break;
  }
}