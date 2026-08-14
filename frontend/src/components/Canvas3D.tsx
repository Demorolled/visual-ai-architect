import { useCallback, useRef } from 'react';
import { Canvas as ThreeCanvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3, Camera, Raycaster } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import SceneContent from './SceneContent';
import type { NodeType } from '../types';

export interface UIDragData {
  label: string;
  description: string;
  functionId: string;
  defaultAction?: string;
  category?: string;
  linkedNodeLabel?: string;
}

interface Canvas3DProps {
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onDoubleClickNode: (id: string) => void;
  onDragNode: (id: string, x: number, y: number) => void;
  onDropNode: (type: NodeType, x: number, y: number, uiData?: UIDragData) => void;
}

// ── Module-level shared refs (populated by R3F inner components + callback refs) ──
let sharedCamera: Camera | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedControls: OrbitControlsImpl | null = null;
const raycaster = new Raycaster();
const mouse = new Vector3();
const planeNormal = new Vector3(0, 1, 0);
const planePoint = new Vector3(0, -30, 0); // Y = -30 (grid plane)

function getIntersection(clientX: number, clientY: number): { x: number; z: number } | null {
  if (!sharedCamera || !sharedCanvas) return null;

  const rect = sharedCanvas.getBoundingClientRect();
  // Normalized device coordinates (-1 to 1)
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

  mouse.set(ndcX, ndcY, 0.5);
  mouse.unproject(sharedCamera);

  const dir = mouse.clone().sub(sharedCamera.position).normalize();
  raycaster.set(sharedCamera.position, dir);

  // Intersect with plane Y=-30
  const denom = dir.dot(planeNormal);
  if (Math.abs(denom) < 0.0001) return null; // parallel

  const t = (planePoint.dot(planeNormal) - sharedCamera.position.dot(planeNormal)) / denom;
  if (t < 0) return null; // behind camera

  const point = sharedCamera.position.clone().add(dir.clone().multiplyScalar(t));
  return { x: point.x, z: point.z };
}

function CaptureRefs() {
  const { camera, gl } = useThree();
  sharedCamera = camera;
  sharedCanvas = gl.domElement;
  return null;
}



/** Reset camera to default position and stop auto-rotation */
export function resetCameraView(): void {
  if (!sharedControls) return;
  sharedControls.target.set(0, 0, 0);
  sharedControls.object.position.set(400, 400, 600);
  sharedControls.autoRotate = false;
  sharedControls.update();
}

/** Pan the camera target by (dx, dz) in world space */
export function panCamera(dx: number, dz: number): void {
  if (!sharedControls) return;
  sharedControls.target.x += dx;
  sharedControls.target.z += dz;
  sharedControls.update();
}

/** Center camera on a list of node positions, with padding */
export function centerOnNodes(
  nodePositions: Array<{ x: number; y: number }>,
  padding: number = 200,
): void {
  if (!sharedControls || nodePositions.length === 0) return;
  const minX = Math.min(...nodePositions.map(n => n.x));
  const maxX = Math.max(...nodePositions.map(n => n.x));
  const minZ = Math.min(...nodePositions.map(n => n.y));
  const maxZ = Math.max(...nodePositions.map(n => n.y));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const size = Math.max(maxX - minX, maxZ - minZ, 200);
  const dist = size * 1.5 + padding;
  sharedControls.target.set(cx, 0, cz);
  sharedControls.object.position.set(cx + dist * 0.6, dist * 0.6, cz + dist);
  sharedControls.autoRotate = false;
  sharedControls.update();
}

export default function Canvas3D({ selectedNodeId, onSelectNode, onDoubleClickNode, onDragNode, onDropNode }: Canvas3DProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Handle DnD from palette
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    
    // Use proper perspective raycast to find world position
    const intersection = getIntersection(e.clientX, e.clientY);
    const worldX = intersection?.x ?? 250;
    const worldZ = intersection?.z ?? 200;

    // Check for UI function drag from UIFunctionNode
    const uiFunctionData = e.dataTransfer.getData('application/ui-function');
    if (uiFunctionData) {
      try {
        const parsed = JSON.parse(uiFunctionData) as UIDragData;
        onDropNode('ui', worldX, worldZ, parsed);
        return;
      } catch { /* fall through */ }
    }

    const type = e.dataTransfer.getData('application/reactflow') as NodeType;
    if (!type) return;

    onDropNode(type, worldX, worldZ);
  }, [onDropNode]);

  return (
    <div style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#1b1b30',
        overflow: 'hidden',
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ThreeCanvas
        camera={{
          position: [400, 400, 600],
          fov: 45,
          near: 1,
          far: 5000,
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        {/* Captures camera + gl + controls for raycasting + d-pad */}
        <CaptureRefs />

        {/* Solid dim backdrop — dark slate, no pattern, nodes stay visible */}
        <color attach="background" args={['#1b1b30']} />


        {/* Ambient light for base illumination */}
        <ambientLight intensity={0.5} color="#404060" />
        
        {/* Main directional light */}
        <directionalLight
          position={[200, 400, 300]}
          intensity={0.8}
          color="#ffffff"
        />
        
        {/* Fill light from below */}
        <directionalLight
          position={[-200, -100, -200]}
          intensity={0.3}
          color="#4466aa"
        />

        {/* Back light */}
        <directionalLight
          position={[0, 200, -400]}
          intensity={0.4}
          color="#6688cc"
        />

        {/* Ground grid */}
        <gridHelper
          args={[2000, 40, '#1a1a3e', '#1a1a3e']}
          position={[0, -30, 0]}
        />

        {/* 3D Scene Content */}
        <SceneContent
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onDoubleClickNode={onDoubleClickNode}
          onDragNode={onDragNode}
        />

        {/* Orbit Controls (manual orbit only — no auto-rotate) */}
        <OrbitControls
          ref={(el: OrbitControlsImpl | null) => {
            controlsRef.current = el;
            if (el) sharedControls = el;
          }}
          enableDamping
          dampingFactor={0.1}
          minDistance={100}
          maxDistance={2000}
          maxPolarAngle={Math.PI / 2.1}
          target={[0, 0, 0]}
          autoRotate={false}
          autoRotateSpeed={0.4}
        />
      </ThreeCanvas>
    </div>
  );
}
