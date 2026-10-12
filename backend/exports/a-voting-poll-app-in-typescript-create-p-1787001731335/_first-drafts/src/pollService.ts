import { Poll, PollOption } from './types';
import { savePoll, loadPolls } from './storage';

class PollService {
  private polls: Poll[] = [];

  constructor() {
    this.polls = loadPolls();
  }

  createPoll(question: string, options: string[]): Poll {
    const poll: Poll = {
      id: this.polls.length + 1,
      question,
      options: options.map(option => ({ option, votes: 0 })),
    };
    this.polls.push(poll);
    savePoll(poll);
    return poll;
  }

  castVote(pollId: number, option: string): void {
    const poll = this.polls.find(p => p.id === pollId);
    if (!poll) throw new Error(`Poll with ID ${pollId} not found`);
    const opt = poll.options.find(o => o.option === option);
    if (!opt) throw new Error(`Option ${option} not found in poll ${pollId}`);
    opt.votes++;
    savePoll(poll);
  }

  getResults(pollId: number): PollOption[] {
    const poll = this.polls.find(p => p.id === pollId);
    if (!poll) throw new Error(`Poll with ID ${pollId} not found`);
    return poll.options;
  }
}

export const pollService = new PollService();
export function createPoll(question: string, options: string[]): Poll {
  return pollService.createPoll(question, options);
}

export function castVote(pollId: number, option: string): void {
  pollService.castVote(pollId, option);
}

export function getResults(pollId: number): PollOption[] {
  return pollService.getResults(pollId);
}