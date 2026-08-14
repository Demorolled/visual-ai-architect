def question(question: str, options: list[str], correct_index: int) -> bool:
    print(question)
    for idx, option in enumerate(options, 1):
        print(f'{idx}. {option}')
    user_input = input('Your answer: ')
    try:
        chosen = int(user_input) - 1
        if 0 <= chosen < len(options):
            return chosen == correct_index
        else:
            print('Invalid choice. Please select a number from the options.')
            return False
    except ValueError:
        print('Please enter a number.')
        return False

def run() -> None:
    questions = [
        ('What is the capital of France?', ['Paris', 'Berlin', 'Rome', 'London'], 0),
        ('What is the largest planet in our solar system?', ['Mars', 'Saturn', 'Jupiter', 'Neptune'], 2),
        ('Which of these is not a prime number?', ['23', '37', '53', '91'], 3),
    ]
    score = 0
    for q in questions:
        if question(*q):
            score += 1
    print(f'Final score: {score}/{len(questions)}')

if __name__ == '__main__':
    run()
