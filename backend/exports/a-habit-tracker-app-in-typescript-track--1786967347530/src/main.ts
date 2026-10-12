import { HabitService, addHabit, markDone, getStreaks } from '../habitService';

export function run(): void {
  const service = new HabitService();

  // Add a habit
  const habit = addHabit('Read a book');
  console.log('Added habit:', habit);

  // Mark the habit as done
  markDone(habit.id);
  console.log('Marked habit done:', habit);

  // Get streaks
  const streaks = getStreaks();
  console.log('Streaks:', streaks);
}

export function main(): void {
  run();
}

main();