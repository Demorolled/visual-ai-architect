// Counts characters and words in the provided text

export function countCharactersAndWords(text: string): { characters: number, words: number } {
  const characterCount = text.length;
  const wordCount = text.trim() === '' ? 0 : text.split(/\s+/).filter(word => word.length > 0).length;

  return {
    characters: characterCount,
    words: wordCount
  };
}