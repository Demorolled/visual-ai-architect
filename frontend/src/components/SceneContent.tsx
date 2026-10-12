import { useCallback } from 'react';
import { NodeData } from '../types';
import { useProjectStore } from '../store/projectStore';
import Node3DObject from './Node3D';
import Edge3D from './Edge3D';

interface SceneContentProps {
  selectedNodeId: string | null;
  /** All currently selected node ids (multi-select). Falls back to the single id. */
  selectedNodeIds?: string[];
  onSelectNode: (id: string | null, additive?: boolean) => void;
  onDoubleClickNode: (id: string) => void;
  onDragNode: (id: string, x: number, y: number) => void;
}

export default function SceneContent({ selectedNodeId, selectedNodeIds, onSelectNode, onDoubleClickNode, onDragNode }: SceneContentProps) {
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  // Just-created connection to emphasise (set by Connect & Describe on apply).
  const highlightedEdgeId = useProjectStore((s) => s.highlightedEdgeId);

  // Selection may be a set (multi-select) or a single id; the parent decides
  // whether a click toggles, adds, or replaces — this only reports the click.
  const isNodeSelected = useCallback((id: string) => (
    selectedNodeIds ? selectedNodeIds.includes(id) : id === selectedNodeId
  ), [selectedNodeIds, selectedNodeId]);

  const handleClickNode = useCallback((id: string, additive?: boolean) => {
    onSelectNode(id, additive);
  }, [onSelectNode]);

  const handleDoubleClick = useCallback((id: string) => {
    onDoubleClickNode(id);
  }, [onDoubleClickNode]);

  const handleDrag = useCallback((id: string, x: number, y: number) => {
    onDragNode(id, x, y);
  }, [onDragNode]);

  // Filter out master/ui-functions nodes - they're rendered as HTML overlays
  const renderableNodes = nodes.filter(n => n.type !== 'master' && n.type !== 'ui-functions');
  const renderableEdges = edges.filter(e => 
    nodes.some(n => n.id === e.source && n.type !== 'master') &&
    nodes.some(n => n.id === e.target && n.type !== 'master')
  );

  return (
    <group>
      {/* Render edges */}
      {renderableEdges.map((edge) => (
        <Edge3D
          key={edge.id}
          id={edge.id}
          source={edge.source}
          target={edge.target}
          data={edge.data as any}
          highlighted={edge.id === highlightedEdgeId}
        />
      ))}

      {/* Render nodes */}
      {renderableNodes.map((node) => (
        <Node3DObject
          key={node.id}
          id={node.id}
          x={node.position.x}
          y={node.position.y}
          data={node.data as NodeData}
          selected={isNodeSelected(node.id)}
          onClick={handleClickNode}
          onDoubleClick={handleDoubleClick}
          onDrag={handleDrag}
        />
      ))}
    </group>
  );
}
