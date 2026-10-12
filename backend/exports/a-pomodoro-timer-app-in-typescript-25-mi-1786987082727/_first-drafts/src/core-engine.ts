export interface Session {
  elapsedTime: number;
  startTime: number;
}

let interval: NodeJS.Timeout | null = null;
let elapsedTime = 0;
let isRunning = false;
const history: Session[] = [];

export function start() {
  if (isRunning) return;
  isRunning = true;
  const startTime = Date.now();
  interval = setInterval(() => {
    elapsedTime = Date.now() - startTime;
    console.log(`Elapsed time: ${Math.floor(elapsedTime / 1000)}s`);
  }, 1000);
}

export function stop() {
  if (!isRunning) return;
  isRunning = false;
  if (interval) clearInterval(interval);
  history.push({ elapsedTime, startTime: Date.now() });
}

export function reset() {
  elapsedTime = 0;
  isRunning = false;
  if (interval) clearInterval(interval);
}

export function undo() {
  if (history.length === 0) return;
  history.pop();
  elapsedTime = history.length > 0 ? history[history.length - 1].elapsedTime : 0;
}

export function getHistory() {
  return history;
}

export function getElapsedTime() {
  return elapsedTime;
}

export function isStarted() {
  return isRunning;
}