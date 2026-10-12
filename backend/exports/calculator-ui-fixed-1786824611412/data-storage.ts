export class DataStorage {
  private storage: { [key: string]: any };

  constructor() {
    this.storage = {};
  }

  saveData(key: string, value: any): void {
    this.storage[key] = value;
  }

  getData(key: string): any | null {
    return this.storage[key] ?? null;
  }

  deleteData(key: string): void {
    delete this.storage[key];
  }

  getAllData(): { [key: string]: any } {
    return this.storage;
  }
}