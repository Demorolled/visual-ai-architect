import { useEffect, useCallback, useRef } from 'react';
import type React from 'react';
import ReactFlow, {
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowInstance,
  Controls,
  Background,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { NodeType, SubNodeData } from '../types';
import { useProjectStore, getNextSubNodeId } from '../store/projectStore';
import CustomNode from './CustomNode';
import './NodeLogicEditor.css';

const nodeTypes = {
  input: CustomNode,
  output: CustomNode,
  logic: CustomNode,
  api: CustomNode,
  database: CustomNode,
  ui: CustomNode,
};

export default function NodeLogicEditor() {
  const {
    nodes,
    selectedNode,
    logicEditorOpen,
    setLogicEditorOpen,
    addSubNode,
    deleteSubNode,
    addSubNodeEdge,
  } = useProjectStore();

  const parentNode = nodes.find((n) => n.id === selectedNode);
  const subNodes = (parentNode?.data?.subNodes as SubNodeData[]) || [];
  const subEdges = (parentNode?.data?.subNodeEdges || []) as Array<{ id: string; source: string; target: string }>;

  const [reactFlowNodes, setReactFlowNodes, onNodesChange] = useNodesState([]);
  const [reactFlowEdges, setReactFlowEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);

  useEffect(() => {
    if (logicEditorOpen && parentNode) {
      setReactFlowNodes(
        subNodes.map((sn) => ({
          id: sn.id,
          type: sn.type,
          position: sn.position,
          data: sn,
        }))
      );
      setReactFlowEdges(subEdges);
    }
  }, [nodes, selectedNode, logicEditorOpen]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      if (!selectedNode) return;
      const newEdge = {
        id: `sub_edge_${params.source}_${params.target}`,
        type: 'default',
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
      };
      setReactFlowEdges((eds) => addEdge(newEdge, eds));
      addSubNodeEdge(selectedNode, newEdge);
    },
    [selectedNode, setReactFlowEdges, addSubNodeEdge]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow') as NodeType;
      if (!type || !selectedNode) return;

      const instance = reactFlowInstanceRef.current;
      if (!instance) return;
      const position = instance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newSubNode: SubNodeData = {
        id: getNextSubNodeId(),
        label: type,
        description: '',
        type,
        status: 'pending',
        position,
      };

      setReactFlowNodes((nds) => [
        ...nds,
        { id: newSubNode.id, type, position, data: newSubNode },
      ]);
      addSubNode(selectedNode, newSubNode);
    },
    [selectedNode, setReactFlowNodes, addSubNode]
  );

  const handleDeleteSubNode = useCallback(
    (nodeId: string) => {
      if (!selectedNode) return;
      setReactFlowNodes((nds) => nds.filter((n) => n.id !== nodeId));
      deleteSubNode(selectedNode, nodeId);
    },
    [selectedNode, setReactFlowNodes, deleteSubNode]
  );

  if (!logicEditorOpen || !parentNode) return null;

  return (
    <div className="node-logic-overlay">
      <div className="node-logic-panel">
        <div className="logic-header">
          <div className="logic-header-info">
            <span className="logic-parent-label">{parentNode.data?.label}</span>
            <span className="logic-parent-id">{parentNode.id}</span>
          </div>
          <button className="logic-close-btn" onClick={() => setLogicEditorOpen(false)}>
            ✕
          </button>
        </div>

        <div className="logic-toolbar">
          <span className="logic-toolbar-label">Drag sub-nodes here:</span>
          <div className="logic-node-palette">
            {(['input', 'output', 'logic', 'api', 'database', 'ui'] as NodeType[]).map((type) => (
              <div
                key={type}
                className="logic-palette-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/reactflow', type);
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <span className={`logic-dot logic-dot-${type}`} />
                <span className="logic-palette-label">{type}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="logic-canvas-wrapper" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={reactFlowNodes}
            edges={reactFlowEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onInit={(instance) => { reactFlowInstanceRef.current = instance; }}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
          >
            <Controls />
            <Background color="#2a2a44" gap={20} />
          </ReactFlow>
        </div>

        <div className="logic-subnode-list">
          <span className="logic-list-label">Sub-nodes ({subNodes.length})</span>
          {subNodes.length === 0 ? (
            <p className="logic-empty">Drag nodes from the palette above</p>
          ) : (
            <div className="logic-subnode-items">
              {subNodes.map((sn) => (
                <div key={sn.id} className="logic-subnode-item">
                  <span className={`logic-subnode-dot logic-dot-${sn.type}`} />
                  <span className="logic-subnode-name">{sn.label}</span>
                  <span className="logic-subnode-id">{sn.id}</span>
                  <button
                    className="logic-subnode-delete"
                    onClick={() => handleDeleteSubNode(sn.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
