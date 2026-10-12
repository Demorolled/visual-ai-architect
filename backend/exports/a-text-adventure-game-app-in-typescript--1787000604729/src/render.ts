import { Room, Item } from '../game/game.ts';

export function render(room: Room, inventory: Item[], player: { name: string }): void {
  console.log(`You are in the ${room.name}.`);
  console.log(room.description);
  console.log('Exits:', room.exits.join(', '));

  if (room.items.length > 0) {
    console.log('Items in the room:', room.items.map(item => item.name).join(', '));
  }

  if (inventory.length > 0) {
    console.log('Inventory:', inventory.map(item => item.name).join(', '));
  }
}

export function renderInventory(inventory: Item[]): void {
  if (inventory.length > 0) {
    console.log('Inventory:', inventory.map(item => item.name).join(', '));
  } else {
    console.log('Your inventory is empty.');
  }
}