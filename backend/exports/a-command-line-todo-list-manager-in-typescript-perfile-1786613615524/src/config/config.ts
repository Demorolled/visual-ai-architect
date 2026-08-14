export interface Config {
  databaseUri: string;
  port: number;
  isDev: boolean;
}

export const config: Config = {
  databaseUri: 'mysql://localhost:3306/todo_list',
  port: 3000,
  isDev: true,
};

export function validateConfig(config: Config): void {
  if (!config.databaseUri) {
    throw new Error('Database URI is missing');
  }
  if (!config.port) {
    throw new Error('Port number is missing');
  }
}