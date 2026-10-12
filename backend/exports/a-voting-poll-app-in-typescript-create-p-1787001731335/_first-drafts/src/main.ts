import { PollService, createPoll, castVote, getResults } from './pollService';

export function run() {
  const poll = createPoll('What is your favorite color?', ['Red', 'Blue', 'Green', 'Other']);
  castVote(poll.id, 'Blue');
  castVote(poll.id, 'Green');
  const results = getResults(poll.id);
  console.log(results);
}

export function main() {
  run();
}