import { addHabit, listHabits } from './types';

export function run() {
  const habits = listHabits();
  console.log('Habits:', habits);
}

export function main() {
  run();
}

main();