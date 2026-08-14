import { useRef, useMemo, memo } from 'react';
import { InstancedMesh, Color, SphereGeometry, ShaderMaterial, BufferAttribute, Matrix4 } from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { NodeData } from '../types';

interface InstancedNode {
  id: string;
  x: number;
  y: number;
  data: NodeData;
  selected: boolean;
  hovered: boolean;
}

interface InstancedNodesProps {
  nodes: InstancedNode[];
  onNodeClick: (id: string) => void;
}

const dummyColor = new Color();
const RADIUS = 18;

const nodeColors: Record<string, string> = {
  input: '#4ade80', output: '#f87171', logic: '#60a5fa',
  api: '#a78bfa', database: '#fbbf24', ui: '#f472b6',
  'gui-layout': '#00d9ff',
};

const vertexShader = `
  uniform float uTime;
  attribute float aPhase;
  varying vec3 vColor;

  void main() {
    vec3 pos = position;
    float phase = aPhase;
    float floatY = sin(uTime * 0.6 + phase) * 3.2 + sin(uTime * 0.9 + phase * 1.3) * 1.2;
    float driftX = sin(uTime * 0.4 + phase * 0.7) * 1.5;
    float driftZ = sin(uTime * 0.35 + phase * 0.9 + 1.2) * 1.5;
    pos.x += driftX;
    pos.y += floatY;
    pos.z += driftZ;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vColor = (instanceColor * 0.6 + 0.4).rgb;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(vColor, 0.85);
  }
`;

function InstancedNodes({ nodes, onNodeClick }: InstancedNodesProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const matRef = useRef<ShaderMaterial>(null);
  const timeRef = useRef(0);

  // Pre-compute per-node phases deterministic from id
  const phases = useMemo(() => {
    const arr = new Float32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      const id = nodes[i].id;
      let hash = 0;
      for (let j = 0; j < id.length; j++) hash = (hash * 31 + id.charCodeAt(j)) % 1000;
      arr[i] = (hash / 1000) * Math.PI * 2;
    }
    return arr;
  }, [nodes]);

  const geom = useMemo(() => {
    const g = new SphereGeometry(RADIUS, 12, 12);
    g.setAttribute('aPhase', new BufferAttribute(new Float32Array(nodes.length), 1));
    return g;
  }, [nodes.length]);

  const mat = useMemo(() => {
    return new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader,
      fragmentShader,
      transparent: true,
    });
  }, []);

  // Update instance colors + phases when nodes change
  useMemo(() => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;
    const posAttr = mesh.geometry.getAttribute('aPhase') as BufferAttribute;
    if (posAttr) {
      for (let i = 0; i < nodes.length; i++) {
        posAttr.array[i] = phases[i];
      }
      posAttr.needsUpdate = true;
    }
    mesh.count = nodes.length;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      dummyColor.set(nodeColors[n.data.type] || '#666');
      mesh.setColorAt(i, dummyColor);
      // Set position matrix (updates per frame for raycasting accuracy)
      const m = new Matrix4().makeTranslation(n.x, 0, n.y);
      mesh.setMatrixAt(i, m);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
  }, [nodes, phases]);

  useFrame((state) => {
    if (!matRef.current) return;
    timeRef.current = state.clock.elapsedTime;
    matRef.current.uniforms.uTime.value = timeRef.current;
  });

  if (nodes.length === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[geom, mat, nodes.length]}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) onNodeClick(nodes[e.instanceId].id);
        }}
      />
      {nodes.map((n) => (
        <Text
          key={n.id}
          position={[n.x, -RADIUS - 6, n.y]}
          fontSize={10}
          color={n.hovered || n.selected ? '#ffffff' : '#cbd5e1'}
          anchorX="center"
          anchorY="top"
          maxWidth={120}
        >
          {n.data.label || n.data.type}
        </Text>
      ))}
    </group>
  );
}

export default memo(InstancedNodes);
