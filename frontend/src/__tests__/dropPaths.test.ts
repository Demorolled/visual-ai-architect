import { describe, it, expect } from 'vitest';
import { dropRealPaths, type DropItemLike } from '../utils/dropPaths';

/** A dropped file. Only `name` matters here — the resolver is injected. */
const f = (name: string): File => ({ name } as unknown as File);

/** A DataTransferItem. `file` null models an item that hands back no File. */
const item = (file: File | null): DropItemLike => ({ kind: 'file', getAsFile: () => file });

/** The app bridge: a real path for folders and files, '' for anything else. */
const bridge = (file: File): string =>
  file.name.startsWith('/') ? file.name : '';

/** A plain browser: no bridge at all. */
const noBridge = (): string => '';

describe('dropRealPaths', () => {
  it('resolves a dropped file from its item', () => {
    expect(dropRealPaths([item(f('/apps/demo')), { kind: 'string', getAsFile: () => null }], [], bridge)).toEqual([
      '/apps/demo',
    ]);
  });

  it('ignores non-file items', () => {
    const stringItem = { kind: 'string', getAsFile: () => f('/nope') };
    expect(dropRealPaths([stringItem], [], bridge)).toEqual([]);
  });

  // The case that motivated this module: a dropped FOLDER whose item yields no
  // File still has a usable path in `dataTransfer.files`. Missing it costs the
  // whole binary half of the folder, because the scan then degrades to a
  // text-only staged copy.
  it('falls back to the file list when the item yields no File (a dropped folder)', () => {
    expect(dropRealPaths([item(null)], [f('/home/me/tic tac toe')], bridge)).toEqual([
      '/home/me/tic tac toe',
    ]);
  });

  it('falls back when the item yields a File the bridge cannot resolve', () => {
    // getAsFile() handed back something, but no path came of it — the file list
    // is the better answer, not silence.
    expect(dropRealPaths([item(f('bare-name'))], [f('/real/path')], bridge)).toEqual(['/real/path']);
  });

  it('does not fall back when the item route already resolved every file', () => {
    // Otherwise the same path would arrive twice and a one-folder drop would
    // stop looking like a single target.
    const paths = dropRealPaths([item(f('/one'))], [f('/one')], bridge);
    expect(paths).toEqual(['/one']);
  });

  it('tops the list up rather than replacing it', () => {
    // One of two files resolved. The unresolved one must still count, or this
    // two-item drop would be mistaken for a single target and scanned as one
    // path — silently dropping the other file's contribution.
    const paths = dropRealPaths([item(f('/one')), item(null)], [f('/one'), f('/two')], bridge);
    expect(paths).toEqual(['/one', '/two']);
  });

  it('keeps drop order and drops duplicates', () => {
    const paths = dropRealPaths([item(f('/a')), item(null), item(f('/a'))], [f('/a'), f('/a')], bridge);
    expect(paths).toEqual(['/a']);
  });

  it('returns nothing when there is no bridge (a plain browser drop)', () => {
    expect(dropRealPaths([item(f('/x'))], [f('/x')], noBridge)).toEqual([]);
  });

  it('returns nothing for a drop that carries no files', () => {
    expect(dropRealPaths([], [], bridge)).toEqual([]);
    expect(dropRealPaths([{ kind: 'string', getAsFile: () => null }], [], bridge)).toEqual([]);
  });

  it('survives an item whose getAsFile throws', () => {
    const throwing: DropItemLike = {
      kind: 'file',
      getAsFile: () => {
        throw new Error('unreadable item');
      },
    };
    expect(dropRealPaths([throwing], [f('/still/usable')], bridge)).toEqual(['/still/usable']);
  });

  it('survives a resolver that throws', () => {
    const bad = (): string => {
      throw new Error('bridge blew up');
    };
    expect(dropRealPaths([item(f('/x'))], [f('/x')], bad)).toEqual([]);
  });

  it('ignores a resolver that returns a non-string', () => {
    const weird = (() => null) as unknown as (file: File) => string;
    expect(dropRealPaths([item(f('/x'))], [f('/x')], weird)).toEqual([]);
  });
});
