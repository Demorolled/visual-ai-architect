export interface HabitItem {
  id: number;
  name: string;
  streak: number;
  lastCompleted: Date;
}

export function addHabit(habit: HabitItem) {
  // Add habit to storage
}

export function listHabits() {
  // Return list of habits
  return [] as HabitItem[];
}