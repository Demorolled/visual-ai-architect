export const runDatabase = () => true;
export const startServer = () => true;
export const start = () => {
  runDatabase();
  startServer();
};