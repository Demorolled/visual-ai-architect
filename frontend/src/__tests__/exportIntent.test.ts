import { describe, it, expect } from 'vitest';
import { detectExportIntent, suggestOutputDir } from '../utils/exportIntent';

describe('detectExportIntent', () => {
  it('detects the real request that used to get the canned preview reply', () => {
    const intent = detectExportIntent(
      'take the design on the canvas, compile it to work on Ubuntu and export it out to desktop seperate folder, named tic tac toe'
    );
    expect(intent).not.toBeNull();
    expect(intent!.folderName).toBe('tic tac toe');
    expect(intent!.os).toBe('linux');
    expect(intent!.toDesktop).toBe(true);
  });

  it('detects a compile-for-OS request that refers to the existing app', () => {
    const intent = detectExportIntent('compile it to work on ubuntu');
    expect(intent).not.toBeNull();
    expect(intent!.os).toBe('linux');
    expect(intent!.folderName).toBeNull();
  });

  it('detects a plain export-to-desktop request', () => {
    const intent = detectExportIntent('export it to my desktop');
    expect(intent).not.toBeNull();
    expect(intent!.toDesktop).toBe(true);
  });

  it('captures an explicit destination path', () => {
    const intent = detectExportIntent('save it to ~/Desktop/myapp');
    expect(intent).not.toBeNull();
    expect(intent!.outputDir).toBe('~/Desktop/myapp');
  });

  it('captures an absolute path', () => {
    const intent = detectExportIntent('write the app out to /home/llmlab/projects/chess');
    expect(intent).not.toBeNull();
    expect(intent!.outputDir).toBe('/home/llmlab/projects/chess');
  });

  it('never hijacks a plain build request', () => {
    expect(
      detectExportIntent('build me a simple tic tac toe game, in a stand alone app. No browser.')
    ).toBeNull();
  });

  it('never hijacks an app whose FEATURE is called export', () => {
    expect(detectExportIntent('build me a CSV export tool')).toBeNull();
    expect(detectExportIntent('create a report export utility')).toBeNull();
  });

  it('does not treat a question about exporting as a command', () => {
    expect(detectExportIntent('how do I export my app?')).toBeNull();
    expect(detectExportIntent('what does the export button do?')).toBeNull();
    expect(detectExportIntent('where do exported files go?')).toBeNull();
  });

  it('does not fire for unrelated chat', () => {
    expect(detectExportIntent('hello')).toBeNull();
    expect(detectExportIntent('can you explain the architecture')).toBeNull();
    expect(detectExportIntent('')).toBeNull();
  });
});

describe('suggestOutputDir', () => {
  it('turns a desktop request into the ~/Desktop PARENT (the scaffolder appends the app name)', () => {
    // PerFileScaffolder does path.resolve(customDir, sanitizedName), so
    // returning ~/Desktop/<name> here would nest the app twice.
    const intent = detectExportIntent('export it out to desktop folder, named tic tac toe')!;
    expect(suggestOutputDir(intent)).toBe('~/Desktop');
  });

  it('prefers an explicit path over the desktop default', () => {
    const intent = detectExportIntent('export it to /home/llmlab/out')!;
    expect(suggestOutputDir(intent)).toBe('/home/llmlab/out');
  });

  it('returns undefined when no destination was named', () => {
    const intent = detectExportIntent('compile it to work on ubuntu')!;
    expect(suggestOutputDir(intent)).toBeUndefined();
  });
});
