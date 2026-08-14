import { Node, Edge } from 'reactflow';
import { OSType } from '../types';

export const ROADMAP_CHANNEL = 'visual-ai-roadmap';

export type RoadmapSyncMessage = {
  type: 'state-update';
  payload: {
    nodes: Node[];
    edges: Edge[];
    selectedNode: string | null;
    targetOS: OSType;
    generationLayer: number;
    isGenerating: boolean;
  };
} | {
  type: 'select-node';
  payload: { nodeId: string | null };
} | {
  type: 'sync-request';
  payload: Record<string, never>;
} | {
  type: 'sync-response';
  payload: {
    nodes: Node[];
    edges: Edge[];
    selectedNode: string | null;
    targetOS: OSType;
    generationLayer: number;
    isGenerating: boolean;
  };
} | {
  type: 'auto-save';
  payload: {
    nodes: Node[];
    edges: Edge[];
  };
};

let channel: BroadcastChannel | null = null;

function getChannel() {
  if (!channel && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel(ROADMAP_CHANNEL);
  }
  return channel;
}

export function broadcastState(state: RoadmapSyncMessage['payload']) {
  const ch = getChannel();
  if (ch) {
    ch.postMessage({ type: 'state-update', payload: state });
  }
}

export function broadcastSelectNode(nodeId: string | null) {
  const ch = getChannel();
  if (ch) {
    ch.postMessage({ type: 'select-node', payload: { nodeId } });
  }
}

export function subscribeRoadmap(
  onUpdate: (payload: RoadmapSyncMessage['payload']) => void,
  onSelect: (nodeId: string | null) => void,
  onSyncRequest: () => void
) {
  const ch = getChannel();
  if (!ch) return () => {};

  ch.onmessage = (event: MessageEvent<RoadmapSyncMessage>) => {
    if (event.data.type === 'state-update') {
      onUpdate(event.data.payload as RoadmapSyncMessage['payload']);
    } else if (event.data.type === 'select-node') {
      onSelect(event.data.payload.nodeId);
    } else if (event.data.type === 'sync-request') {
      onSyncRequest();
    } else if (event.data.type === 'sync-response') {
      onUpdate(event.data.payload as RoadmapSyncMessage['payload']);
    }
  };

  return () => {
    ch.close();
    channel = null;
  };
}

export function requestSync() {
  const ch = getChannel();
  if (ch) {
    ch.postMessage({ type: 'sync-request', payload: {} });
  }
}

export function broadcastSyncResponse(state: RoadmapSyncMessage['payload']) {
  const ch = getChannel();
  if (ch) {
    ch.postMessage({ type: 'sync-response', payload: state });
  }
}
