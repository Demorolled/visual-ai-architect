import { Node, Edge } from 'reactflow';
import { OSType } from '../types';

const USER_NAME_KEY = 'vaia-user-name';

interface RoadmapData {
  projectName: string;
  targetOS: OSType;
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    description: string;
    language?: string;
    position: { x: number; y: number };
  }>;
  edges: Array<{ source: string; target: string }>;
  createdAt: string;
}

function getUserName(): string | null {
  return localStorage.getItem(USER_NAME_KEY);
}

export async function saveRoadmap(projectName: string, targetOS: OSType, nodes: Node[], edges: Edge[]) {
  const roadmap: RoadmapData = {
    projectName,
    targetOS,
    nodes: nodes
      .filter((n) => n.type !== 'master')
      .map((n) => ({
        id: n.id,
        type: n.type || 'logic',
        label: (n.data as any)?.label || n.type,
        description: (n.data as any)?.description || '',
        language: (n.data as any)?.language,
        position: n.position,
      })),
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
    })),
    createdAt: new Date().toISOString(),
  };

  // Always save to localStorage as fallback
  const roadmaps = loadRoadmaps();
  roadmaps.push(roadmap);
  localStorage.setItem('ai-architect-roadmaps', JSON.stringify(roadmaps));

  // Save to disk via backend if user name is set
  const name = getUserName();
  if (name) {
    const filename = `${projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.json`;
    fetch('/api/user/files/' + encodeURIComponent(name) + '/roadmaps/' + filename, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: JSON.stringify(roadmap, null, 2) }),
    }).catch(() => {});
  }

  return roadmap;
}

export function loadRoadmaps(): RoadmapData[] {
  try {
    return JSON.parse(localStorage.getItem('ai-architect-roadmaps') || '[]');
  } catch {
    return [];
  }
}

export function getLatestRoadmap(): RoadmapData | null {
  const roadmaps = loadRoadmaps();
  return roadmaps.length > 0 ? roadmaps[roadmaps.length - 1] : null;
}
