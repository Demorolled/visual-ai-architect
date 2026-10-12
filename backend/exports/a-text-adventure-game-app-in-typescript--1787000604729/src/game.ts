export class Game {
  private rooms: Room[];
  private player: Player;
  private currentRoom: Room;

  constructor(rooms: Room[], player: Player) {
    this.rooms = rooms;
    this.player = player;
    this.currentRoom = rooms[0];
  }

  public move(direction: string): void {
    const nextRoom = this.currentRoom.getAdjacent(direction);
    if (nextRoom) {
      this.currentRoom = nextRoom;
    } else {
      console.log('You cannot go that direction.');
    }
  }

  public take(item: string): void {
    const foundItem = this.currentRoom.removeItem(item);
    if (foundItem) {
      this.player.addItem(foundItem);
      console.log(`You took the ${item}.`);
    } else {
      console.log(`There is no ${item} here.`);
    }
  }

  public look(): void {
    console.log(this.currentRoom.getDescription());
    const items = this.currentRoom.getItems();
    if (items.length > 0) {
      console.log(`You see: ${items.join(', ')}`);
    } else {
      console.log('There are no items here.');
    }
  }

  public getCurrentRoom(): Room {
    return this.currentRoom;
  }

  public getPlayer(): Player {
    return this.player;
  }
}

export class Room {
  private description: string;
  private items: string[];
  private connections: { [key: string]: Room };

  constructor(description: string) {
    this.description = description;
    this.items = [];
    this.connections = {};
  }

  public addItem(item: string): void {
    this.items.push(item);
  }

  public removeItem(item: string): string | null {
    const index = this.items.indexOf(item);
    if (index !== -1) {
      this.items.splice(index, 1);
      return item;
    }
    return null;
  }

  public getDescription(): string {
    return this.description;
  }

  public getItems(): string[] {
    return this.items;
  }

  public connect(direction: string, room: Room): void {
    this.connections[direction] = room;
  }

  public getAdjacent(direction: string): Room | null {
    return this.connections[direction] || null;
  }
}

export class Player {
  private inventory: string[];

  constructor() {
    this.inventory = [];
  }

  public addItem(item: string): void {
    this.inventory.push(item);
  }

  public getInventory(): string[] {
    return this.inventory;
  }
}