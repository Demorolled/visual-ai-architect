export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

export function countChars(text: string): number {
  return text.replace(/\s+/g, '').length;
}

export function countSentences(text: string): number {
  return text.trim().split(/[.!?]+/).filter(sentence => sentence.length > 0).length;
}

export function getMostFrequentWords(text: string, limit = 10): Record<string, number> {
  const words = text.toLowerCase().match(/\b\w+\b/g);
  if (!words) return {};

  const frequency: Record<string, number> = {};
  for (const word of words) {
    frequency[word] = (frequency[word] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
  );
}