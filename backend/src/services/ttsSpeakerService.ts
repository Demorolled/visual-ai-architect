/**
 * TTS Speaker Service
 * ====================
 * Gives the VACA platform (Veronica) a voice.
 *
 * Uses msedge-tts to generate neural speech and ffplay/aplay to play it
 * on the server. Automatically speaks status updates so the user can
 * hear what VACA is doing.
 *
 * Speaks are queued — if a second speak() call arrives while the first
 * is still playing, it waits in line and plays after the first finishes.
 * This prevents garbled overlapping audio.
 *
 * Events emitted via WebSocket:
 *   vaca:speaking    — { speaking: bool, text: string }
 *   vaca:tts_status  — { connected: bool, voice: string, volume: number, enabled: bool }
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { spawn, execSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getIO } from '../socket/socketManager.js';
import { existsSync } from 'fs';

// ─── Types ────────────────────────────────────────────────────────────────

export interface TTSSettings {
  /** Voice identifier (e.g. "en-US-GuyNeural") */
  voice: string;
  /** Volume multiplier 0.0–1.0 */
  volume: number;
  /** Rate multiplier 0.5–2.0 */
  rate: number;
  /** Pitch multiplier 0.5–2.0 */
  pitch: number;
  /** Whether TTS speaking is enabled */
  enabled: boolean;
}

export interface TTSStatus {
  /** Whether the TTS player is available */
  connected: boolean;
  /** Whether audio is currently playing */
  speaking: boolean;
  /** Current settings */
  settings: TTSSettings;
  /** Last spoken text (truncated) */
  lastText: string;
  /** Total utterances spoken */
  totalUtterances: number;
  /** Number of utterances waiting in the queue */
  queueLength: number;
}

// ─── Symbol & Emoji spoken-word expansion ────────────────────────────────

// ─── Normalize text for natural speech ───────────────────────────────
// By default code blocks are silenced — code is displayed in the terminal,
// not read aloud. Pass codeToWords: true only when the user asked for it.

function normalizeForSpeech(text: string, codeToWords = false): string {
  let result = text;

  // 1. Markdown code fences (``` ... ```)
  if (codeToWords) {
    result = result.replace(/```[a-zA-Z0-9_-]*\s*/g, ' ');
    result = result.replace(/```/g, ' ');
  } else {
    // Default: never read code aloud — silence complete fences and any
    // unclosed fence opener along with the rest of the text (likely code)
    result = result.replace(/```[\s\S]*?```/g, ' ');
    result = result.replace(/```[a-zA-Z0-9_-]*[\s\S]*$/g, ' ');
  }

  // 2. Remove inline code backticks, keep inner text
  result = result.replace(/`([^`]+)`/g, ' $1 ');
  // 2b. Remove any remaining lone backticks (stray inline markers)
  result = result.replace(/`/g, ' ');

  // 3. Strip markdown bold/italic
  result = result.replace(/\*\*([^*]+)\*\*/g, ' $1 ');
  result = result.replace(/\*([^*]+)\*/g, ' $1 ');
  result = result.replace(/__([^_]+)__/g, ' $1 ');
  result = result.replace(/_([^_]+)_/g, ' $1 ');

  // 4. Common code patterns → natural speech
  result = result.replace(/\s*=>\s*/g, ' becomes ');
  result = result.replace(/\s*===\s*/g, ' equals ');
  result = result.replace(/\s*==\s*/g, ' equals ');
  result = result.replace(/\s*!==\s*/g, ' does not equal ');
  result = result.replace(/\s*!=\s*/g, ' does not equal ');
  result = result.replace(/\s*>=\s*/g, ' greater than or equal ');
  result = result.replace(/\s*<=\s*/g, ' less than or equal ');
  result = result.replace(/\s*&&\s*/g, ' and ');
  result = result.replace(/\s*\|\|\s*/g, ' or ');

  // 5. Package paths — replace / with "slash" only within path patterns
  result = result.replace(
    /([a-zA-Z0-9_\-.]+)(\/)([a-zA-Z0-9_\-.]+)/g,
    (match) => match.replace(/\//g, ' slash ')
  );

  // 6. File extensions — "file.ts" → "file dot ts"
  result = result.replace(/\.([a-zA-Z]{2,4})(?=\s|$)/g, ' dot $1 ');

  // 7. Strip standalone symbols that are annoying in speech
  result = result.replace(/(?<=^|[\s(])[*#@$%^&~`|\\_{}\[\]<>](?=[\s)]|$)/g, ' ');

  // 8. Replace known emojis
  for (const [emoji, replacement] of Object.entries(EMOJI_MAP)) {
    result = result.replace(new RegExp(emoji, 'g'), replacement);
  }

  // 9. Strip remaining unmapped emojis
  result = result.replace(
    /[\u{1F000}-\u{1FFFF}]|[\u{2700}-\u{27BF}]|[\u{2600}-\u{26FF}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]/gu,
    ''
  );

  // 10. Collapse whitespace and trim
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

const EMOJI_MAP: Record<string, string> = {
  '😀': ' grinning face ',
  '😂': ' face with tears of joy ',
  '🤣': ' rolling on the floor laughing ',
  '😊': ' smiling face ',
  '😍': ' smiling face with heart eyes ',
  '🥰': ' smiling face with hearts ',
  '🤔': ' thinking face ',
  '😏': ' smirking face ',
  '😢': ' crying face ',
  '😭': ' loudly crying face ',
  '😡': ' enraged face ',
  '🤖': ' robot face ',
  '👍': ' thumbs up ',
  '👎': ' thumbs down ',
  '👏': ' clapping hands ',
  '🙌': ' raising hands ',
  '🤝': ' handshake ',
  '🙏': ' folded hands ',
  '💪': ' flexed biceps ',
  '🎉': ' party popper ',
  '🎊': ' confetti ball ',
  '🚀': ' rocket ',
  '💡': ' light bulb ',
  '✨': ' sparkles ',
  '🔥': ' fire ',
  '⭐': ' star ',
  '❤️': ' red heart ',
  '💔': ' broken heart ',
  '✅': ' check mark ',
  '❌': ' cross mark ',
  '❓': ' question mark ',
  '❗': ' exclamation mark ',
  '⚠️': ' warning ',
  '🔧': ' wrench ',
  '🔒': ' locked lock ',
  '🔓': ' unlocked lock ',
  '💻': ' laptop ',
  '📱': ' mobile phone ',
  '☕': ' hot beverage ',
  '🍕': ' pizza ',
  '🍔': ' hamburger ',
  '🎯': ' bullseye ',
  '🎮': ' video game ',
  '🎵': ' musical note ',
  '🔊': ' speaker ',
  '🎨': ' artist palette ',
  '📝': ' memo ',
  '📚': ' books ',
  '💯': ' hundred points ',
  '👑': ' crown ',
  '🏆': ' trophy ',
  '🌈': ' rainbow ',
  '☀️': ' sun ',
  '🌙': ' moon ',
  '🚨': ' alert ',
  '♻️': ' recycling ',
  '™️': ' trademark ',
  '©️': ' copyright ',
  '®️': ' registered ',
};

// ─── Default Settings ─────────────────────────────────────────────────────

const DEFAULT_SETTINGS: TTSSettings = {
  voice: 'en-US-GuyNeural',
  volume: 0.8,
  rate: 1.0,
  pitch: 1.0,
  enabled: true,
};

// ─── Service ──────────────────────────────────────────────────────────────

class TTSSpeakerService {
  private settings: TTSSettings = { ...DEFAULT_SETTINGS };
  private _speaking: boolean = false;
  private _lastText: string = '';
  private _totalUtterances: number = 0;
  private _initialized: boolean = false;
  private _ffplayAvailable: boolean = false;
  private _aplayAvailable: boolean = false;
  private _player: string = '';

  // FIFO queue serializes speak() calls to prevent overlapping audio
  private _queue: string[] = [];
  private _processing: boolean = false;

  constructor() {
    this._detectPlayers();
  }

  // ─── Initialization ──────────────────────────────────────────────────

  private _detectPlayers(): void {
    try {
      execSync('which ffplay 2>/dev/null', { stdio: 'pipe' });
      this._ffplayAvailable = true;
      this._player = 'ffplay';
    } catch {
      // ffplay not available
    }

    if (!this._ffplayAvailable) {
      try {
        execSync('which aplay 2>/dev/null', { stdio: 'pipe' });
        this._aplayAvailable = true;
        this._player = 'aplay';
      } catch {
        // aplay not available
      }
    }

    if (this._player) {
      this._initialized = true;
      console.log(`[TTSSpeaker] Voice service initialized — using "${this._player}" as player`);
      console.log(`[TTSSpeaker] Voice: ${this.settings.voice} | Volume: ${this.settings.volume} | Enabled: ${this.settings.enabled}`);
      this._emitStatus();
    } else {
      console.warn('[TTSSpeaker] No audio player found (ffplay/aplay). Speech will be silent.');
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────

  /**
   * Speak a line of text aloud.
   *
   * Text is queued — if another speak is in progress, this waits in line.
   * Uses msedge-tts to generate MP3, then ffplay/aplay to play it.
    * Emits WebSocket events so the frontend knows the assistant is speaking.
   *
   * Returns true if the text was enqueued (not necessarily spoken yet).
   */
  async speak(text: string): Promise<boolean> {
    if (!this._initialized || !this.settings.enabled) return false;
    const clean = normalizeForSpeech(text).trim().slice(0, 1000);
    if (!clean) return false;

    // Enqueue and process
    this._queue.push(clean);
    if (!this._processing) {
      this._processing = true;
      // Process queue asynchronously — don't await, let callers return fast
      this._processQueue().catch(err => {
        console.error('[TTSSpeaker] Queue processor error:', err);
        this._processing = false;
        this._speaking = false;
      });
    }
    return true;
  }

  /**
   * Speak a predefined announcement.
   * Maps event names to short, natural-sounding phrases.
   */
  async announce(event: 'connected' | 'design_ready' | 'starting' | 'shutting_down', extra?: string): Promise<boolean> {
    const phrases: Record<string, string> = {
      connected: 'Veronica online.',
      design_ready: `Design plan is ready. ${extra || ''}`,
      starting: 'Veronica voice service is starting.',
      shutting_down: 'Voice service shutting down.',
    };

    const text = phrases[event] || extra || '';
    if (!text) return false;
    return this.speak(text);
  }

  /**
   * Speak VACA's full introduction from the speech file on the Desktop.
   * Reads VACA_Speech.txt, splits it into sections, and speaks each
   * section in order through the existing queue system.
   *
   * Triggered by: "Venorica, tell me about yourself" or similar commands.
   */
  async speakIntroduction(): Promise<boolean> {
    if (!this._initialized || !this.settings.enabled) return false;

    // Locate the speech file on the Desktop
    const homeDir = process.env.HOME || '/home/final-flash1';
    const speechPath = join(homeDir, 'Desktop', 'VACA_Speech.txt');

    let content: string;
    try {
      content = readFileSync(speechPath, 'utf-8');
    } catch {
      console.error('[TTSSpeaker] Could not read speech file at:', speechPath);
      this.speak('I have an introduction prepared, but I could not find my speech file on the desktop.');
      return false;
    }

    console.log('[TTSSpeaker] 📖 Reading introduction from VACA_Speech.txt');

    // Strip box-drawing and decorative characters from the raw content
    // before any splitting or normalization
    content = content
      .replace(/[\u{2500}-\u{257F}]/gu, '')   // strip box-drawing chars (╔║╚═ etc.)
      .replace(/[\u{2580}-\u{259F}]/gu, '');  // strip block-element chars (▀▄█▌▐ etc.)

    // Remove lines that are purely decorative separators (= or - only)
    content = content.replace(/^[=\-]{4,}$\n?/gm, '');

    // Split into speakable sections — split on SECTION headers
    const sections = content.split(/(?=SECTION \d+:)/g).filter(s => {
      const trimmed = s.trim();
      // Skip very short fragments or appendix
      if (trimmed.length < 30) return false;
      if (trimmed.startsWith('APPENDIX') || trimmed.startsWith('END OF')) return false;
      return true;
    });

    // Clean each section for speech and queue it
    for (const section of sections) {
      // Pre-clean: strip remaining separator lines and normalize whitespace
      let clean = section
        .replace(/^[=\-]{2,}\n?/gm, '')   // remove any remaining = or - lines
        .replace(/[\u{2500}-\u{257F}]/gu, '')  // double-check for box chars
        .replace(/\n{3,}/g, '\n\n')      // collapse triple+ newlines
        .trim();

      clean = normalizeForSpeech(clean).trim();
      if (clean.length < 20) continue;

      // Truncate very long sections to stay within TTS limits
      const chunked = clean.length > 900 ? this._chunkText(clean, 900) : [clean];
      for (const chunk of chunked) {
        this._queue.push(chunk);
      }
    }

    // Start processing the queue if not already running
    if (!this._processing) {
      this._processing = true;
      this._processQueue().catch(err => {
        console.error('[TTSSpeaker] Queue processor error:', err);
        this._processing = false;
        this._speaking = false;
      });
    }

    return true;
  }

  /**
   * Split long text into smaller chunks that fit the TTS limit.
   * Splits on sentence boundaries when possible.
   */
  private _chunkText(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLen) {
      // Try to break at a sentence or clause boundary
      let breakAt = remaining.lastIndexOf('. ', maxLen);
      if (breakAt < maxLen / 2) breakAt = remaining.lastIndexOf(', ', maxLen);
      if (breakAt < maxLen / 2) breakAt = remaining.lastIndexOf(' ', maxLen);
      if (breakAt < maxLen / 2) breakAt = maxLen;

      chunks.push(remaining.slice(0, breakAt + 1).trim());
      remaining = remaining.slice(breakAt + 1).trim();
    }

    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    return chunks;
  }

  // ─── Settings ────────────────────────────────────────────────────────

  getStatus(): TTSStatus {
    return {
      connected: this._initialized,
      speaking: this._speaking,
      settings: { ...this.settings },
      lastText: this._lastText,
      totalUtterances: this._totalUtterances,
      queueLength: this._queue.length,
    };
  }

  updateSettings(partial: Partial<TTSSettings>): TTSSettings {
    if (partial.voice !== undefined) this.settings.voice = partial.voice;
    if (partial.volume !== undefined) this.settings.volume = Math.max(0, Math.min(1, partial.volume));
    if (partial.rate !== undefined) this.settings.rate = Math.max(0.5, Math.min(2, partial.rate));
    if (partial.pitch !== undefined) this.settings.pitch = Math.max(0.5, Math.min(2, partial.pitch));
    if (partial.enabled !== undefined) this.settings.enabled = partial.enabled;
    this._emitStatus();
    return { ...this.settings };
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  get isEnabled(): boolean {
    return this.settings.enabled;
  }

  get isSpeaking(): boolean {
    return this._speaking;
  }

  // ─── Queue Processing ───────────────────────────────────────────────

  /**
   * Process the FIFO queue, speaking each item in order.
   * Runs until the queue is empty.
   */
  private async _processQueue(): Promise<void> {
    while (this._queue.length > 0) {
      const text = this._queue.shift()!;
      await this._speakOnce(text);
    }
    this._processing = false;
  }

  /**
   * Generate and play a single utterance.
   */
  private async _speakOnce(text: string): Promise<void> {
    this._lastText = text;
    this._speaking = true;
    this._emitSpeaking(true, text);
    console.log(`[TTSSpeaker] 🔊 Speaking: "${text.slice(0, 80)}..."`);

    const mp3Path = join(tmpdir(), `vaca_tts_${Date.now()}_${process.pid}.mp3`);

    try {
      // Generate MP3 audio using msedge-tts
      const tts = new MsEdgeTTS();
      await tts.setMetadata(this.settings.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text);
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.from(chunk));
      }
      const audioBuffer = Buffer.concat(chunks);
      writeFileSync(mp3Path, audioBuffer);
      tts.close();

      // Play it back
      if (this._ffplayAvailable) {
        await this._playWithFFplay(mp3Path);
      } else if (this._aplayAvailable) {
        await this._playWithAplay(mp3Path);
      }

      this._totalUtterances++;
    } catch (err) {
      console.error('[TTSSpeaker] Error generating or playing speech:', err);
    } finally {
      // Clean up temp file
      try { if (existsSync(mp3Path)) unlinkSync(mp3Path); } catch { /* ok */ }
      this._speaking = false;
      this._emitSpeaking(false, '');
    }
  }

  // ─── Playback ────────────────────────────────────────────────────────

  private _playWithFFplay(mp3Path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('ffplay', [
        '-nodisp', '-autoexit', '-loglevel', 'quiet',
        mp3Path,
      ], { stdio: 'ignore' });

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('Playback timeout'));
      }, 30000);

      proc.on('exit', (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`ffplay exit code ${code}`));
      });
      proc.on('error', reject);
    });
  }

  private _playWithAplay(mp3Path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // aplay does not support MP3 natively — decode via ffmpeg first
      const decode = spawn('ffmpeg', [
        '-i', mp3Path,
        '-f', 'wav', 'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'ignore'] });

      const play = spawn('aplay', ['-q'], { stdio: ['pipe', 'ignore', 'ignore'] });
      decode.stdout.pipe(play.stdin);

      const timeout = setTimeout(() => {
        decode.kill();
        play.kill();
        reject(new Error('Playback timeout'));
      }, 30000);

      play.on('exit', (code) => {
        clearTimeout(timeout);
        decode.kill(); // Always clean up the decoder subprocess
        if (code === 0) resolve();
        else reject(new Error(`aplay exit code ${code}`));
      });
      decode.on('error', () => play.kill());
      play.on('error', () => decode.kill());
    });
  }

  // ─── WebSocket Events ────────────────────────────────────────────────

  private _emitSpeaking(speaking: boolean, text: string): void {
    const io = getIO();
    if (io) {
      io.emit('vaca:speaking', {
        speaking,
        text,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private _emitStatus(): void {
    const io = getIO();
    if (io) {
      io.emit('vaca:tts_status', {
        connected: this._initialized,
        voice: this.settings.voice,
        volume: this.settings.volume,
        enabled: this.settings.enabled,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

// ─── Singleton Export ──────────────────────────────────────────────────────

export const ttsSpeaker = new TTSSpeakerService();
export default ttsSpeaker;
