import { Game, Board, Player } from './game';

export function run() {
  const game = new Game();
  game.play(0, 0);
  game.play(1, 1);
  game.play(2, 2);
}

export function main() {
  run();
}