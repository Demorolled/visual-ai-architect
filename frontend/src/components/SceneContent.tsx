import { useCallback } from 'react';
import { NodeData } from '../types';
import { useProjectStore } from '../store/projectStore';
import Node3DObject from './Node3D';
import Edge3D from './Edge3D';

interface SceneContentProps {
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onDoubleClickNode: (id: string) => void;
  onDragNode: (id: string, x: number, y: number) => void;
}

export default function SceneContent({ selectedNodeId, onSelectNode, onDoubleClickNode, onDragNode }: SceneContentProps) {
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);

  const handleClickNode = useCallback((id: string) => {
    onSelectNode(id === selectedNodeId ? null : id);
  }, [selectedNodeId, onSelectNode]);

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
          selected={node.id === selectedNodeId}
          onClick={handleClickNode}
          onDoubleClick={handleDoubleClick}
          onDrag={handleDrag}
        />
      ))}
    </group>
  );
}
