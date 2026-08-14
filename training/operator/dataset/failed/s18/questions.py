def _trivia_question(question: str, options: list[str], correct_index: int) -> tuple[str, list[str], int]:
    return question, options, correct_index

QUESTIONS = [
    _trivia_question(
        "What is 2 + 2?",
        ["1", "2", "3", "4"],
        3
    ),
    _trivia_question(
        "Which of the following is a prime number?",
        ["2", "4", "6", "8"],
        0
    ),
    _trivia_question(
        "Who is the current president of the United States?",
        ["Joe Biden", "Donald Trump", "Barack Obama", "George W. Bush"],
        0
    ),
]