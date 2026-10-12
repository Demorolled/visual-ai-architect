import { scoreQuiz, getResults } from '../scoring/scoring.ts';

// Quiz question type
export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
}

// Quiz result type
export interface QuizResult {
  score: number;
  totalQuestions: number;
  correct: number;
  incorrect: number;
}

// Load questions from a JSON file
export function loadQuestions(filePath: string): QuizQuestion[] {
  try {
    const data = Deno.readTextFileSync(filePath);
    return JSON.parse(data) as QuizQuestion[];
  } catch (error) {
    console.error(`Error loading questions from ${filePath}: ${error.message}`);
    return [];
  }
}

// Render the quiz to the terminal
export function renderQuiz(questions: QuizQuestion[]): number[] {
  const answers: number[] = [];
  for (let i = 0; i < questions.length; i++) {
    console.log(`Question ${i + 1}: ${questions[i].question}`);
    for (let j = 0; j < questions[i].options.length; j++) {
      console.log(`  ${j + 1}. ${questions[i].options[j]}`);
    }
    const answer = prompt(`Enter your answer (1-${questions[i].options.length}):`);
    if (answer && parseInt(answer) >= 1 && parseInt(answer) <= questions[i].options.length) {
      answers.push(parseInt(answer) - 1);
    } else {
      console.log('Invalid answer. Skipping this question.');
      answers.push(-1);
    }
  }
  return answers;
}

// Render the quiz results to the terminal
export function renderResults(results: QuizResult): void {
  console.log(`Quiz Results:`);
  console.log(`  Score: ${results.score} / ${results.totalQuestions}`);
  console.log(`  Correct: ${results.correct}`);
  console.log(`  Incorrect: ${results.incorrect}`);
}