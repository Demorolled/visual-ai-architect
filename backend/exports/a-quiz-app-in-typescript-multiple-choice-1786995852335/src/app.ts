// Entry point: parses args, orchestrates the app
import { Quiz, addQuestion } from './quiz';
import { loadQuestions } from './storage';

export function run(args) {
    const questions = loadQuestions();
    if (questions.length === 0) {
        console.log('No questions found. Please add some first.');
        return;
    }

    const score = { correct: 0, total: 0 };
    questions.forEach((q, i) => {
        console.log(`Question ${i + 1}: ${q.question}`);
        q.options.forEach((opt, index) => {
            console.log(`${index + 1}. ${opt}`);
        });
        const answer = prompt('Your answer (1-4): ');
        if (parseInt(answer) === q.answer) {
            score.correct++;
        }
        score.total++;
    });

    console.log(`Results: ${score.correct}/${score.total} correct`);
}

export function main() {
    const args = process.argv.slice(2);
    run(args);
}