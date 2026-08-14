import { useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { broadcastState, subscribeRoadmap, broadcastSyncResponse } from '../utils/roadmapSync';

export function useRoadmapSync() {
  const nodes = useProjectStore(s => s.nodes);
  const edges = useProjectStore(s => s.edges);
  const selectedNode = useProjectStore(s => s.selectedNode);
  const targetOS = useProjectStore(s => s.targetOS);
  const generationLayer = useProjectStore(s => s.generationLayer);
  const isGenerating = useProjectStore(s => s.isGenerating);

  useEffect(() => {
    broadcastState({
      nodes,
      edges,
      selectedNode,
      targetOS,
      generationLayer,
      isGenerating,
    });
  }, [nodes, edges, selectedNode, targetOS, generationLayer, isGenerating]);

  useEffect(() => {
    const unsub = subscribeRoadmap(
      () => {},
      (nodeId: string | null) => {
        useProjectStore.getState().setSelectedNode(nodeId);
      },
      () => {
        const state = useProjectStore.getState();
        broadcastSyncResponse({
          nodes: state.nodes,
          edges: state.edges,
          selectedNode: state.selectedNode,
          targetOS: state.targetOS,
          generationLayer: state.generationLayer,
          isGenerating: state.isGenerating,
        });
      }
    );

    return unsub;
  }, []);
}
