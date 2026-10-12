// File-based JSON storage for quiz questions
import { Quiz } from './quiz';

const QUIZ_FILE = 'src/questions.json';

export function loadQuestions() {
    try {
        const data = require(QUIZ_FILE);
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

export function saveQuestions(questions) {
    require(QUIZ_FILE).writeFileSync(JSON.stringify(questions, null, 2));
}