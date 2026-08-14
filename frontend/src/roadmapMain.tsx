import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { subscribeRoadmap, requestSync, broadcastSelectNode } from './utils/roadmapSync';
import RoadmapWindow from './components/RoadmapWindow';
import './index.css';
import './App.css';
import './components/Roadmap.css';

interface StatePayload {
  nodes: Node[];
  edges: Edge[];
  selectedNode: string | null;
}

function RoadmapApp() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const unsub = subscribeRoadmap(
      (payload) => {
        const p = payload as StatePayload;
        setNodes(p.nodes);
        setEdges(p.edges);
        setSelectedNode(p.selectedNode);
        setConnected(true);
      },
      (nodeId: string | null) => {
        setSelectedNode(nodeId);
      },
      () => {
        requestSync();
      }
    );

    requestSync();

    return unsub;
  }, []);

  const handleNodeClick = (nodeId: string) => {
    const newSelected = nodeId === selectedNode ? null : nodeId;
    setSelectedNode(newSelected);
    broadcastSelectNode(newSelected);
  };

  return (
    <div className="roadmap-window">
      <header className="roadmap-window-header">
        <h2>Roadmap</h2>
        <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● Connected' : '○ Waiting for project'}
        </span>
      </header>
      <RoadmapWindow
        nodes={nodes}
        edges={edges}
        selectedNode={selectedNode}
        onNodeClick={handleNodeClick}
      />
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<RoadmapApp />);
