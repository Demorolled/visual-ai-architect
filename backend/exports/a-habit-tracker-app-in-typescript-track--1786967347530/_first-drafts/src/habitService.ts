import { Habit, Streak } from '../types';
import { saveHabits, loadHabits } from '../storageService';

export class HabitService {
  private habits: Habit[];

  constructor() {
    this.habits = loadHabits();
  }

  addHabit(name: string): Habit {
    const newHabit: Habit = {
      id: Date.now().toString(),
      name,
      completed: false,
      streak: 0,
    };
    this.habits.push(newHabit);
    saveHabits(this.habits);
    return newHabit;
  }

  markDone(id: string): void {
    const habit = this.habits.find(h => h.id === id);
    if (habit) {
      habit.completed = true;
      habit.streak = this.calculateStreak(habit);
      saveHabits(this.habits);
    }
  }

  private calculateStreak(habit: Habit): number {
    if (habit.completed) return habit.streak + 1;
    return 0;
  }

  getStreaks(): Streak[] {
    return this.habits.map(h => ({
      habitId: h.id,
      startDate: new Date(),
      currentStreak: h.streak,
    }));
  }
}

export function addHabit(name: string): Habit {
  const service = new HabitService();
  return service.addHabit(name);
}

export function markDone(id: string): void {
  const service = new HabitService();
  service.markDone(id);
}

export function getStreaks(): Streak[] {
  const service = new HabitService();
  return service.getStreaks();
}