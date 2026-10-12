import { Node, Edge } from 'reactflow';
import { OSType, AppTree } from '../types';

export interface AutoSaveSnapshot {
  nodes: Node[];
  edges: Edge[];
  /**
   * Tree Mode: the project's app trees. Optional so autosaves captured before
   * Tree Mode existed still restore (the store re-derives a single tree).
   */
  trees?: AppTree[];
  targetOS: OSType;
  projectName: string;
}

export interface AutoSaveEntry {
  id: string;
  projectId: string;
  snapshot: AutoSaveSnapshot;
  savedAt: string;
}

const STORAGE_KEY = 'vaia-autosaves';

function getAll(): Record<string, AutoSaveEntry[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setAll(all: Record<string, AutoSaveEntry[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage full or unavailable
  }
}

function snapshotsEqual(a: AutoSaveSnapshot, b: AutoSaveSnapshot): boolean {
  return a.projectName === b.projectName
    && a.targetOS === b.targetOS
    && JSON.stringify(a.nodes) === JSON.stringify(b.nodes)
    && JSON.stringify(a.edges) === JSON.stringify(b.edges)
    // Tree edits (add/rename/delete) change no node or edge on their own, so
    // without this an added tree would look like "no change" and never save.
    && JSON.stringify(a.trees) === JSON.stringify(b.trees);
}

export function performAutoSave(
  projectId: string,
  current: AutoSaveSnapshot
): AutoSaveEntry | null {
  if (!projectId) return null;

  const all = getAll();
  const saves = all[projectId] || [];

  if (saves.length > 0 && snapshotsEqual(saves[0].snapshot, current)) {
    return null;
  }

  const entry: AutoSaveEntry = {
    id: `autosave_${Date.now()}`,
    projectId,
    snapshot: JSON.parse(JSON.stringify(current)),
    savedAt: new Date().toISOString(),
  };

  saves.unshift(entry);
  all[projectId] = saves.slice(0, 5);
  setAll(all);
  return entry;
}

export function getAutoSaves(projectId: string): AutoSaveEntry[] {
  const all = getAll();
  return all[projectId] || [];
}

export function clearAutoSaves(projectId: string) {
  const all = getAll();
  delete all[projectId];
  setAll(all);
}
