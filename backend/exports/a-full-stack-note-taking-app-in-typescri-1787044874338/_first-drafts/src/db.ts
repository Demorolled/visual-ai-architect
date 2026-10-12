import { Database } from 'sqlite3';
export function getDatabase() {
  return new Database('data.db');
}