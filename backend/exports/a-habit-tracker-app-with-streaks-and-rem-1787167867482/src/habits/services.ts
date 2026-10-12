import { loadHabits, saveHabits } from './storage';
import { HabitItem } from './types';

export function addHabit(habit: HabitItem) {
  const habits = loadHabits();
  habits.push(habit);
  saveHabits(habits);
}

export function listHabits() {
  return loadHabits();
}

export function deleteHabit(id: number) {
  const habits = loadHabits();
  const updated = habits.filter(h => h.id !== id);
  saveHabits(updated);
}

export function updateHabit(id: number, data: Partial<HabitItem>) {
  const habits = loadHabits();
  const updated = habits.map(h => h.id === id ? { ...h, ...data } : h);
  saveHabits(updated);
}