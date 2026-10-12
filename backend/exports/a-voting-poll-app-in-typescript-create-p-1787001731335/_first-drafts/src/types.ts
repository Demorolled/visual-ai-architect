export interface Poll {
  id: number;
  question: string;
  options: PollOption[];
}

export interface PollOption {
  option: string;
  votes: number;
}