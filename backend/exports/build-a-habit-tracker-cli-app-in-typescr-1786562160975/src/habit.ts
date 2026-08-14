import { Habit } from './types';
export { Habit } from './types';
export const createHabit = (name: string, description: string, goal: number) => ({ name, description, goal, streak: 0, check: () => (this as { streak: number }).streak = Math.min((this as { streak: number }).streak + 1, goal) });
export const checkHabit = (habit: Habit) => habit.check();
export const getStreak = (habit: Habit) => habit.streak;
export const getHabits = () => [];
export const deleteHabit = (habit: Habit) => {};
export const stats = (habits: Habit[]) => ({ completed: 0, total: 0, streaks: [] });