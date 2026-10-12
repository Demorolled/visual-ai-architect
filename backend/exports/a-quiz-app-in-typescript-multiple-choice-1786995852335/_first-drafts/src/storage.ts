// File-based JSON storage for quiz questions
import { Quiz } from './quiz';

const QUIZ_FILE = 'src/questions.json';

export function loadQuestions() {
    try {
        const data = fs.readFileSync(QUIZ_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

export function saveQuestions(questions) {
    fs.writeFileSync(QUIZ_FILE, JSON.stringify(questions, null, 2));
}