import { HabitService, addHabit, markDone, getStreaks } from '../habitService';

export function run(): void {
  const service = new HabitService();

  // Add a habit
  const habit = service.addHabit('Read a book');
  console.log('Added habit:', habit);

  // Mark the habit as done
  service.markDone(habit.id);
  console.log('Marked habit done:', habit);

  // Get streaks
  const streaks = service.getStreaks();
  console.log('Streaks:', streaks);
}

export function main(): void {
  run();
}

main();