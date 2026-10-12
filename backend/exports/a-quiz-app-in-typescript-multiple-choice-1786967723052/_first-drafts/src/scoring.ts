export function scoreQuiz(questions: Question[], answers: { [key: string]: string }): number {
  let score = 0;
  for (const question of questions) {
    if (answers[question.id] === question.correctAnswer) {
      score++;
    }
  }
  return score;
}

export function getResults(questions: Question[], answers: { [key: string]: string }): { correct: number; incorrect: number; total: number } {
  const correct = questions.reduce((acc, q) => {
    return acc + (answers[q.id] === q.correctAnswer ? 1 : 0);
  }, 0);
  const incorrect = questions.length - correct;
  return { correct, incorrect, total: questions.length };
}