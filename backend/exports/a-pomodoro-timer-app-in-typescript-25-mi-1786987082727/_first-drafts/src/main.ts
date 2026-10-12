import { start, stop, reset, undo } from '../core-engine/core-engine.ts';

export function run(): void {
  console.log('Pomodoro Timer started');
  start();
}

export async function main(): Promise<void> {
  try {
    run();
    await new Promise((resolve) => setTimeout(resolve, 1500000)); // 25 minutes
    stop();
    console.log('Break time');
    await new Promise((resolve) => setTimeout(resolve, 300000)); // 5 minutes
    reset();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}