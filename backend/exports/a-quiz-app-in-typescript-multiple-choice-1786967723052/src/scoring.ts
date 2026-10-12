import { Question } from './questions';

export function scoreQuiz(questions: Question[], answers: number[]): number {
  let score = 0;
  for (let i = 0; i < questions.length; i++) {
    if (answers[i] === questions[i].correctAnswer) {
      score++;
    }
  }
  return score;
}

export function getResults(questions: Question[], answers: number[]): { correct: number; incorrect: number; total: number } {
  const correct = answers.filter((a, i) => a === questions[i].correctAnswer).length;
  const incorrect = questions.length - correct;
  return { correct, incorrect, total: questions.length };
}