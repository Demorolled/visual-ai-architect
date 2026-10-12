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
    if (!this.inventory.includes(item)) {
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

export class Inventory {
  private items: string[];

  constructor() {
    this.items = [];
  }

  addItem(item: string): void {
    this.items.push(item);
  }

  removeItem(item: string): void {
    const index = this.items.indexOf(item);
    if (index !== -1) {
      this.items.splice(index, 1);
    }
  }

  getItems(): string[] {
    return this.items;
  }
}