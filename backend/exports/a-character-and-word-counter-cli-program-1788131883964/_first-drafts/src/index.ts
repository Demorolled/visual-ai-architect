import { parseInput } from './input-parser';
import { countCharactersAndWords } from './counter';
import { displayResults } from './output';

const run = (): void => {
  const args = process.argv.slice(2);
  const userInput = parseInput(args);

  if (userInput === null) {
    console.error('Invalid input. Please provide text as input.');
    return;
  }

  const { characters, words } = countCharactersAndWords(userInput);
  displayResults(characters, words);
};

run();