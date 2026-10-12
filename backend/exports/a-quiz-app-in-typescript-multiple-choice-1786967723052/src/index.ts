import { Question, loadQuestions } from './questions';

export function run(): void {
  console.log('Quiz App started');
  const questions = loadQuestions();
  if (questions.length === 0) {
    console.error('No questions loaded');
    return;
  }
  let score = 0;
  for (const question of questions) {
    console.log(question.question);
    question.options.forEach((option, index) => {
      console.log(`${index + 1}. ${option}`);
    });
    const answer = prompt('Enter your answer (1-4): ');
    if (answer && parseInt(answer, 10) === question.answer) {
      score++;
    }
  }
  console.log(`Quiz completed! Your score: ${score}/${questions.length}`);
}

export function main(): void {
  try {
    run();
  } catch (error) {
    console.error('Error running quiz:', error);
  }
}