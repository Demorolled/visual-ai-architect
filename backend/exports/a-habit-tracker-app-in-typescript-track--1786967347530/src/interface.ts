import { addHabit, markDone, getStreaks } from '../habitService';

export function addHabit(name: string) {
  try {
    addHabit(name);
    console.log(`Habit '${name}' added successfully.`);
  } catch (error) {
    console.error(`Failed to add habit '${name}': ${error.message}`);
  }
}

export function markDone(name: string) {
  try {
    markDone(name);
    console.log(`Habit '${name}' marked as done.`);
  } catch (error) {
    console.error(`Failed to mark habit '${name}' as done: ${error.message}`);
  }
}

export function showStreaks() {
  try {
    const streaks = getStreaks();
    console.log('Current streaks:', streaks);
  } catch (error) {
    console.error(`Failed to get streaks: ${error.message}`);
  }
}