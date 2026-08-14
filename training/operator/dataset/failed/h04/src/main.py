HABIT_STREAK = {'exercise': 0}

def complete_day(habit: str) -> None:
    HABIT_STREAK[habit] = HABIT_STREAK.get(habit, 0) + 1

def get_streak(habit: str) -> int:
    return HABIT_STREAK.get(habit, 0)

def main() -> None:
    for _ in range(3):
        complete_day('exercise')
    print(f'Current streak: {get_streak("exercise")}')

if __name__ == '__main__':
    main()
