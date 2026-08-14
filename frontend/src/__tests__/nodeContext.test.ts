import { describe, it, expect } from 'vitest';
import { isNodeQuery } from '../utils/nodeContext';

describe('isNodeQuery', () => {
  it('detects direct node/canvas/architecture words', () => {
    expect(isNodeQuery('show me the nodes')).toBe(true);
    expect(isNodeQuery('what is on the canvas?')).toBe(true);
    expect(isNodeQuery('describe the architecture')).toBe(true);
    expect(isNodeQuery('list the components')).toBe(true);
  });

  it('detects module/connection/data-flow language', () => {
    expect(isNodeQuery('which modules exist?')).toBe(true);
    expect(isNodeQuery('show connections')).toBe(true);
    expect(isNodeQuery('list dependencies')).toBe(true);
    expect(isNodeQuery('how are the edges laid out')).toBe(true);
  });

  it('detects regex-pattern queries (show.*node, list.*node)', () => {
    expect(isNodeQuery('show me every node')).toBe(true);
    expect(isNodeQuery('list all nodes please')).toBe(true);
  });

  it('detects overview/summary/status queries', () => {
    expect(isNodeQuery('give me an overview')).toBe(true);
    expect(isNodeQuery('how many nodes do I have')).toBe(true);
    expect(isNodeQuery('project status?')).toBe(true);
    expect(isNodeQuery('scan the project')).toBe(true);
  });

  it('detects common typos (nods, noded)', () => {
    expect(isNodeQuery('show my nods')).toBe(true);
    expect(isNodeQuery('what is noded')).toBe(true);
  });

  it('returns false for unrelated text', () => {
    expect(isNodeQuery('hello there')).toBe(false);
    expect(isNodeQuery('generate a login form')).toBe(false);
    expect(isNodeQuery('make the colors prettier')).toBe(false);
    expect(isNodeQuery('')).toBe(false);
    expect(isNodeQuery('   ')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isNodeQuery('SHOW ME THE NODES')).toBe(true);
    expect(isNodeQuery('Canvas')).toBe(true);
  });

  it('documents substring-match behavior for node-like words', () => {
    // 'node' inside 'Node.js' still contains the substring — this helper is
    // intentionally substring-based for non-regex keywords, so these match.
    expect(isNodeQuery('using Node.js for the backend')).toBe(true);
    expect(isNodeQuery('troubleshoot my pipeline')).toBe(true); // pipeline is in the list
  });
});
