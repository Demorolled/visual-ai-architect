import { useRef, useState, useCallback, useMemo, memo } from 'react';
import { Mesh, Group, Color } from 'three';
import { Text } from '@react-three/drei';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { NodeData } from '../types';

const nodeColors: Record<string, string> = {
  master: '#f59e0b',
  input: '#4ade80',
  output: '#f87171',
  logic: '#60a5fa',
  api: '#a78bfa',
  database: '#fbbf24',
  ui: '#f472b6',
  'ui-functions': '#f472b6',
  'gui-layout': '#00d9ff',
};

const nodeIcons: Record<string, string> = {
  master: '🎯',
  input: '⬅',
  output: '➡',
  logic: '⚙',
  api: '🌐',
  database: '📦',
  ui: '🖥',
  'ui-functions': '🎛',
  'gui-layout': '⛭',
};

interface Node3DProps {
  id: string;
  x: number;
  y: number;
  data: NodeData;
  selected: boolean;
  onClick: (id: string) => void;
  onDoubleClick: (id: string) => void;
  onDrag: (id: string, x: number, y: number) => void;
}

function Node3D({ id, x, y, data, selected, onClick, onDoubleClick, onDrag }: Node3DProps) {
  const meshRef = useRef<Mesh>(null);
  const floatGroupRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartMouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Derive deterministic phase from node id for staggered floating
  const floatPhase = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 1000;
    return (hash / 1000) * Math.PI * 2;
  }, [id]);

  // ── Floating + hover animation (organic web-drift) ──
  useFrame((state) => {
    if (!floatGroupRef.current) return;
    if (dragging) {
      // Hold position while dragging
      floatGroupRef.current.position.y = 0;
      floatGroupRef.current.position.x = 0;
      floatGroupRef.current.position.z = 0;
      floatGroupRef.current.scale.setScalar(1);
      return;
    }
    const t = state.clock.elapsedTime;
    // Organic 3D drift: vertical bob + horizontal sway + slight rotation
    const floatY = Math.sin(t * 0.6 + floatPhase) * 3.2 + Math.sin(t * 0.9 + floatPhase * 1.3) * 1.2;
    const driftX = Math.sin(t * 0.4 + floatPhase * 0.7) * 1.5;
    const driftZ = Math.sin(t * 0.35 + floatPhase * 0.9 + 1.2) * 1.5;
    // Slight rotation like a caught insect twisting
    const rotY = Math.sin(t * 0.2 + floatPhase) * 0.08;
    const rotX = Math.sin(t * 0.15 + floatPhase * 1.1) * 0.04;
    // Hover lift and scale
    const hoverLift = hovered ? 5 : 0;
    const hoverScale = hovered ? (1 + Math.sin(t * 2.5 + floatPhase) * 0.04) : 1;
    floatGroupRef.current.position.y = floatY + hoverLift;
    floatGroupRef.current.position.x = driftX;
    floatGroupRef.current.position.z = driftZ;
    floatGroupRef.current.rotation.y = rotY;
    floatGroupRef.current.rotation.x = rotX;
    floatGroupRef.current.scale.setScalar(hoverScale);
  });

  const color = nodeColors[data.type] || '#666';
  const icon = nodeIcons[data.type] || '?';
  const radius = selected ? 22 : 18;
  const isMaster = data.type === 'master';

  // Don't render master nodes as 3D objects - they're HTML overlays
  if (isMaster) return null;

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    // Record the starting position for drag
    dragStartPos.current = { x, y };
    dragStartMouse.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [x, y]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    const dx = (e.clientX - dragStartMouse.current.x) * 0.8;
    const dy = (e.clientY - dragStartMouse.current.y) * -0.8;
    onDrag(id, dragStartPos.current.x + dx, dragStartPos.current.y + dy);
  }, [dragging, id, onDrag]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick(id);
  }, [id, onClick]);

  const handleDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onDoubleClick(id);
  }, [id, onDoubleClick]);

  const handlePointerOver = useCallback(() => setHovered(true), []);
  const handlePointerOut = useCallback(() => {
    setHovered(false);
    setDragging(false);
  }, []);

  const statusIndicator = data.status === 'generating' ? '⏳' :
    data.status === 'valid' ? '✓' :
    data.status === 'error' ? '✗' : '○';

  return (
    <group position={[x, 0, y]}>
      {/* Inner group animated by useFrame — floating bob + hover lift/scale */}
      <group ref={floatGroupRef}>
        {/* Glow ring for selected */}
        {selected && (
          <mesh>
            <ringGeometry args={[radius + 4, radius + 8, 32]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.3}
              side={2}
            />
          </mesh>
        )}

        {/* Hover halo */}
        {hovered && !selected && (
          <mesh>
            <ringGeometry args={[radius + 2, radius + 5, 32]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.15}
              side={2}
            />
          </mesh>
        )}

        {/* Main sphere */}
        <mesh
          ref={meshRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        >
          <sphereGeometry args={[radius, 12, 12]} />
          <meshStandardMaterial
            color={new Color(color)}
            roughness={0.3}
            metalness={0.1}
            emissive={selected ? new Color(color) : new Color('#000000')}
            emissiveIntensity={selected ? 0.3 : 0}
            transparent
            opacity={data.status === 'pending' ? 0.7 : 1}
          />
        </mesh>

        {/* Icon text centered in sphere */}
        <Text
          position={[0, 0, radius + 1]}
          fontSize={16}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {icon}
        </Text>

        {/* Label text below sphere */}
        <Text
          position={[0, -radius - 6, 0]}
          fontSize={10}
          color={hovered || selected ? '#ffffff' : '#cbd5e1'}
          anchorX="center"
          anchorY="top"
          maxWidth={120}
        >
          {data.label || data.type}
        </Text>

        {/* Status indicator */}
        <Text
          position={[radius + 8, radius + 4, 0]}
          fontSize={10}
          color={data.status === 'valid' ? '#4ade80' : 
                 data.status === 'error' ? '#f87171' :
                 data.status === 'generating' ? '#fbbf24' : '#64748b'}
          anchorX="left"
          anchorY="middle"
        >
          {statusIndicator}
        </Text>
      </group>
    </group>
  );
}

export default memo(Node3D);
