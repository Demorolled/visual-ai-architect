export interface Habit {
  id: string;
  name: string;
  completed: boolean;
  streak: number;
}

export interface Streak {
  habitId: string;
  startDate: Date;
  currentStreak: number;
}