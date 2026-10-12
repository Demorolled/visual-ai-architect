export interface Question {
  id: number;
  category: string;
  question: string;
  options: string[];
  answer: number;
}

export function loadQuestions(): Question[] {
  return [
    {
      id: 1,
      category: 'General',
      question: 'What is the capital of France?',
      options: ['Berlin', 'Madrid', 'Paris', 'Rome'],
      answer: 2,
    },
    {
      id: 2,
      category: 'Science',
      question: 'Which planet is known as the Red Planet?',
      options: ['Mars', 'Venus', 'Jupiter', 'Saturn'],
      answer: 0,
    },
    {
      id: 3,
      category: 'History',
      question: 'Who wrote "To Kill a Mockingbird"?',
      options: ['Harper Lee', 'J.K. Rowling', 'George Orwell', 'Ernest Hemingway'],
      answer: 0,
    },
    {
      id: 4,
      category: 'Geography',
      question: 'What is the largest desert in the world?',
      options: ['Arctic', 'Antarctic', 'Sahara', 'Gobi'],
      answer: 2,
    },
    {
      id: 5,
      category: 'Technology',
      question: 'Who invented the World Wide Web?',
      options: ['Tim Berners-Lee', 'Steve Jobs', 'Bill Gates', 'Mark Zuckerberg'],
      answer: 0,
    },
  ];
}