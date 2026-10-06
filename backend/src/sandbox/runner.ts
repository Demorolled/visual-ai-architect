import { OSType } from '../types.js';
import { runSandbox, checkSandboxAvailability } from './dockerRunner.js';
import { runErrorCorrection, formatFixReport, FixRequest } from './errorCorrection.js';

export interface SandboxResult {
  success: boolean;
  output: string;
  errors: string[];
  exitCode: number;
  /**
   * True when no checker exists for this language, so the file was NOT
   * validated — as opposed to validated and found broken. A skipped result
   * carries NO `errors`: silence is honest, a fabricated diagnostic is not.
   */
  skipped?: boolean;
  /** Why the check was skipped (only set when `skipped`). */
  reason?: string;
}

export interface SandboxFixResult {
  success: boolean;
  finalCode: string;
  language: string;
  fixAttempts: number;
  totalTimeMs: number;
  report: string;
}

export class SandboxRunner {
  /**
   * Run validation in the sandbox (Docker or local).
   * Accepts code and optional language, returns SandboxResult.
   */
  async run(code: string, os?: OSType | string): Promise<SandboxResult> {
    // Map OSType to language hint
    const language = this.osToLanguage(os || 'linux');
    return runSandbox(code, language);
  }

  /**
   * Run the full error-correction loop: generate → validate → fix → retry.
   * Tries up to 3 times to fix validation errors automatically.
   *
   * @param request - Fix request with code, language, project context
   * @returns SandboxFixResult with final code, attempt history, and report
   */
  async runWithFix(request: FixRequest): Promise<SandboxFixResult> {
    const result = await runErrorCorrection(request);
    return {
      success: result.success,
      finalCode: result.finalCode,
      language: result.language,
      fixAttempts: result.attempts.length,
      totalTimeMs: result.totalTimeMs,
      report: formatFixReport(result),
    };
  }

  /**
   * Check what sandbox tools are available on this system.
   */
  getAvailability(): { docker: boolean; local: string[] } {
    return checkSandboxAvailability();
  }

  /**
   * Map an OS name to its default language, or pass through an actual language
   * name untouched. Previously any unrecognized value (e.g. 'go', 'python',
   * 'rust' passed straight from the file generator) fell through to
   * 'typescript' — which made the sandbox compile Go/Python source with tsc
   * and report bogus TS1434 failures on every non-TS file.
   */
  private osToLanguage(os: string): string {
    const OS_DEFAULT: Record<string, string> = {
      linux: 'typescript',
      windows: 'csharp',
      mac: 'swift',
      ios: 'swift',
      android: 'kotlin',
    };
    if (OS_DEFAULT[os]) return OS_DEFAULT[os];
    return os; // already a language name — pass through
  }
}
