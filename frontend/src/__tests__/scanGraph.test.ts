import { describe, it, expect } from 'vitest';
import { resolveScanConnections, resolveScanEndpoint } from '../utils/scanGraph';

const MAPS = {
  moduleLabels: { src: 'module-src', components: 'module-components', root: 'module-root' },
  fileNodes: { 'src/App.tsx': 'file-app', 'components/NodePalette.tsx': 'file-palette' },
  moduleOfFile: {
    'src/App.tsx': 'module-src',
    'components/NodePalette.tsx': 'module-components',
    'components/Canvas.tsx': 'module-components',
    'components/Toolbar.tsx': 'module-components',
    'src/utils/toast.ts': 'module-src',
  },
};

describe('resolveScanEndpoint', () => {
  it('resolves a module label (the LLM scan shape)', () => {
    expect(resolveScanEndpoint('components', MAPS)).toBe('module-components');
  });

  it('prefers the file’s own node when it has one', () => {
    expect(resolveScanEndpoint('components/NodePalette.tsx', MAPS)).toBe('file-palette');
  });

  it('falls back to the owning module when the file has no node of its own', () => {
    // `components` has more files than the canvas gives nodes to; the import is
    // still measured, so it is drawn at the module level instead of vanishing.
    expect(resolveScanEndpoint('components/Canvas.tsx', MAPS)).toBe('module-components');
  });

  it('returns undefined for something the scan never placed', () => {
    expect(resolveScanEndpoint('react', MAPS)).toBeUndefined();
    expect(resolveScanEndpoint('', MAPS)).toBeUndefined();
  });
});

describe('resolveScanConnections', () => {
  it('draws a measured file-to-file import between the two file nodes', () => {
    const resolved = resolveScanConnections(
      [{ source: 'src/App.tsx', target: 'components/NodePalette.tsx', description: 'App.tsx imports ./components/NodePalette' }],
      MAPS,
    );
    expect(resolved).toEqual([
      { source: 'file-app', target: 'file-palette', description: 'App.tsx imports ./components/NodePalette' },
    ]);
  });

  it('keeps a connection whose files have no nodes by attaching it to their modules', () => {
    const resolved = resolveScanConnections(
      [{ source: 'src/utils/toast.ts', target: 'components/Canvas.tsx', description: 'toast.ts imports ../components/Canvas' }],
      MAPS,
    );
    expect(resolved).toEqual([
      { source: 'module-src', target: 'module-components', description: 'toast.ts imports ../components/Canvas' },
    ]);
  });

  it('still draws a connection when only one end folded into its module', () => {
    // Canvas.tsx has no node of its own (it is past the per-module cap) but
    // NodePalette.tsx does — the module-to-file connection is real and drawable.
    const resolved = resolveScanConnections(
      [{ source: 'components/Canvas.tsx', target: 'components/NodePalette.tsx' }],
      MAPS,
    );
    expect(resolved).toEqual([{ source: 'module-components', target: 'file-palette', description: '' }]);
  });

  it('drops a connection that collapses onto itself', () => {
    // Neither file has a node, so both ends are the same module and a self-loop
    // would say nothing.
    const resolved = resolveScanConnections(
      [{ source: 'components/Canvas.tsx', target: 'components/Toolbar.tsx' }],
      MAPS,
    );
    expect(resolved).toEqual([]);
  });

  it('drops a connection with an end no node can represent', () => {
    const resolved = resolveScanConnections(
      [
        { source: 'src/App.tsx', target: 'react', description: 'App.tsx imports react' },
        { source: 'ghost/file.ts', target: 'src/App.tsx' },
      ],
      MAPS,
    );
    expect(resolved).toEqual([]);
  });

  it('defaults a missing description to an empty string', () => {
    const resolved = resolveScanConnections([{ source: 'src', target: 'components' }], MAPS);
    expect(resolved).toEqual([{ source: 'module-src', target: 'module-components', description: '' }]);
  });

  it('tolerates an absent connection list', () => {
    expect(resolveScanConnections(undefined as any, MAPS)).toEqual([]);
  });
});
