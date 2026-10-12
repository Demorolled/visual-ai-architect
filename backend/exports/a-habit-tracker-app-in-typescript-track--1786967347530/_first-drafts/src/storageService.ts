import { Habit } from '../types';

export function saveHabits(habits: Habit[]): void {
  try {
    const serialized = JSON.stringify(habits);
    localStorage.setItem('habits', serialized);
  } catch (e) {
    console.error('Failed to save habits:', e);
  }
}

export function loadHabits(): Habit[] {
  try {
    const data = localStorage.getItem('habits');
    if (!data) return [];
    return JSON.parse(data) as Habit[];
  } catch (e) {
    console.error('Failed to load habits:', e);
    return [];
  }
}