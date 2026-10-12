// Quiz app JavaScript compiled from TypeScript

// Quiz item type and CRUD operations
class Quiz {
    constructor(id, question, options, answer) {
        this.id = id;
        this.question = question;
        this.options = options;
        this.answer = answer;
    }
}

// File-based JSON storage for quiz questions
const QUIZ_FILE = 'src/questions.json';

function loadQuestions() {
    try {
        const data = fs.readFileSync(QUIZ_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function saveQuestions(questions) {
    fs.writeFileSync(QUIZ_FILE, JSON.stringify(questions, null, 2));
}

// Quiz item type and CRUD operations
export class Quiz {
    constructor(id, question, options, answer) {
        this.id = id;
        this.question = question;
        this.options = options;
        this.answer = answer;
    }
}

// CRUD operations
export function addQuestion(question, options, answer) {
    const quiz = new Quiz(Date.now(), question, options, answer);
    const questions = loadQuestions();
    questions.push(quiz);
    saveQuestions(questions);
    return quiz;
}

export function listQuestions() {
    return loadQuestions();
}

// Entry point: parses args, orchestrates the app
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