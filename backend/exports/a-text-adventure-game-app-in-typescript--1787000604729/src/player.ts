import { ITEMS } from '../items/items.ts';

export class Player {
  private currentRoom: string;
  private inventory: string[];

  constructor(initialRoom: string) {
    this.currentRoom = initialRoom;
    this.inventory = [];
  }

  getCurrentRoom(): string {
    return this.currentRoom;
  }

  setRoom(room: string): void {
    this.currentRoom = room;
  }

  getInventory(): string[] {
    return this.inventory;
  }

  takeItem(item: string): void {
    if (ITEMS.includes(item) && !this.inventory.includes(item)) {
      this.inventory.push(item);
    }
  }

  dropItem(item: string): void {
    const index = this.inventory.indexOf(item);
    if (index !== -1) {
      this.inventory.splice(index, 1);
    }
  }
}