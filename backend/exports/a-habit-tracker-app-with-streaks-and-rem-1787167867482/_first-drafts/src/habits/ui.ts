import { HabitItem } from './types';

export function renderHabits(habits: HabitItem[]) {
  // Render habits to UI
  console.log('Habits:', habits);
}

export function renderStreaks(habits: HabitItem[]) {
  // Render streaks to UI
  habits.forEach(h => console.log(`${h.name} streak: ${h.streak}`));
}

export function renderReminders(habits: HabitItem[]) {
  // Render reminders to UI
  habits.forEach(h => console.log(`${h.name} reminder: ${h.lastCompleted}`));
}