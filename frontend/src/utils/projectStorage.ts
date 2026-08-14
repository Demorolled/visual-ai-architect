import { Node, Edge } from 'reactflow';
import { OSType } from '../types';

const USER_NAME_KEY = 'vaia-user-name';
export const STORAGE_KEY = 'vaia-projects';

export interface SavedProject {
  id: string;
  name: string;
  targetOS: OSType;
  nodes: Node[];
  edges: Edge[];
  savedAt: string;
  version: number;
  /** Optional code review results (persisted so they survive page refreshes) */
  codeReviewResult?: Record<string, any> | null;
}

function getUserName(): string | null {
  return localStorage.getItem(USER_NAME_KEY);
}

function getStore(): SavedProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStore(projects: SavedProject[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function syncToDisk(projects: SavedProject[]) {
  const name = getUserName();
  if (!name) return;
  fetch('/api/user/files/' + encodeURIComponent(name) + '/projects/projects.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: JSON.stringify(projects, null, 2) }),
  }).catch(() => {});
}

export function saveProject(data: {
  id: string;
  name: string;
  targetOS: OSType;
  nodes: Node[];
  edges: Edge[];
  codeReviewResult?: Record<string, any> | null;
}): SavedProject {
  const store = getStore();
  const existing = store.findIndex((p) => p.id === data.id);

  const saved: SavedProject = {
    ...data,
    savedAt: new Date().toISOString(),
    version: existing >= 0 ? (store[existing].version || 0) + 1 : 1,
  };

  if (existing >= 0) {
    store[existing] = saved;
  } else {
    store.push(saved);
  }

  setStore(store);
  syncToDisk(store);
  return saved;
}

export function loadProject(id: string): SavedProject | null {
  const store = getStore();
  return store.find((p) => p.id === id) || null;
}

export function loadProjects(): SavedProject[] {
  return getStore().sort((a, b) =>
    new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );
}

export function deleteProject(id: string): boolean {
  const store = getStore();
  const filtered = store.filter((p) => p.id !== id);
  if (filtered.length === store.length) return false;
  setStore(filtered);
  syncToDisk(filtered);
  return true;
}

export function exportProject(id: string): string | null {
  const project = loadProject(id);
  if (!project) return null;
  return JSON.stringify(project, null, 2);
}

export function importProject(json: string): SavedProject | null {
  try {
    const parsed = JSON.parse(json) as SavedProject;
    if (!parsed.id || !parsed.name || !Array.isArray(parsed.nodes)) return null;

    const dup: SavedProject = {
      ...parsed,
      id: `proj_${Date.now()}`,
      name: parsed.name,
      savedAt: new Date().toISOString(),
      version: 1,
    };

    const store = getStore();
    store.push(dup);
    setStore(store);
    syncToDisk(store);
    return dup;
  } catch {
    return null;
  }
}
