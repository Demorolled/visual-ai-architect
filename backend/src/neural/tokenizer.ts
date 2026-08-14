/**
 * Character-level tokenizer for the tiny RNN.
 * Converts code text into sequences of character indices.
 */

export class CharTokenizer {
  private charToIdx: Map<string, number> = new Map();
  private idxToChar: Map<number, string> = new Map();
  private _vocabSize: number = 0;

  constructor() {
    // Initialize with basic ASCII printable characters
    const chars = '\n !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~\t\r';
    for (const c of chars) {
      if (!this.charToIdx.has(c)) {
        const idx = this._vocabSize;
        this.charToIdx.set(c, idx);
        this.idxToChar.set(idx, c);
        this._vocabSize++;
      }
    }
  }

  /** Build vocabulary from training text */
  fit(texts: string[]): void {
    for (const text of texts) {
      for (const c of text) {
        if (!this.charToIdx.has(c)) {
          const idx = this._vocabSize;
          this.charToIdx.set(c, idx);
          this.idxToChar.set(idx, c);
          this._vocabSize++;
        }
      }
    }
  }

  /** Encode text to sequence of indices */
  encode(text: string): number[] {
    const indices: number[] = [];
    for (const c of text) {
      if (this.charToIdx.has(c)) {
        indices.push(this.charToIdx.get(c)!);
      } else {
        // Unknown char - use space as fallback
        indices.push(this.charToIdx.get(' ') || 0);
      }
    }
    return indices;
  }

  /** Decode indices back to text */
  decode(indices: number[]): string {
    return indices.map(i => this.idxToChar.get(i) || '?').join('');
  }

  /** One-hot encode a single index */
  oneHot(index: number): number[] {
    const vec = new Array(this._vocabSize).fill(0);
    vec[index] = 1.0;
    return vec;
  }

  get vocabSize(): number {
    return this._vocabSize;
  }

  /** Number of chars (for display) */
  get vocabChars(): number {
    return this._vocabSize;
  }
}

export const defaultTokenizer = new CharTokenizer();
