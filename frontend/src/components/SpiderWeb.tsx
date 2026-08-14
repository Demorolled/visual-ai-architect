import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';

/**
 * 3D spiderweb backdrop — GPU-optimized with merged line geometry.
 * All ring + radial strands are in a single <lineSegments> draw call.
 */
export default function SpiderWeb() {
  const webRef = useRef<Group>(null);
  const timeRef = useRef(0);

  const RING_COUNT = 10;
  const RADIAL_COUNT = 36;
  const MAX_RADIUS = 1200;
  const MIN_RADIUS = 40;
  const DEPTH = 300;
  const SEGMENTS = 48;

  // Build ALL web vertices + per-vertex colors into a single buffer
  const webData = useMemo(() => {
    const vertices: number[] = [];
    const colors: number[] = [];

    const GLOW: [number, number, number] = [0.533, 0.4, 1];
    const WEB: [number, number, number] = [0.333, 0.267, 0.667];
    const DIM: [number, number, number] = [0.2, 0.133, 0.4];

    function seg(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, c: [number, number, number]) {
      vertices.push(x1, y1, z1, x2, y2, z2);
      colors.push(c[0], c[1], c[2], c[0], c[1], c[2]);
    }

    // Pre-compute ring sample points
    const rings: Array<Array<[number, number, number]>> = [];
    for (let i = 0; i < RING_COUNT; i++) {
      const t = i / (RING_COUNT - 1);
      const r = MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
      const yOff = -Math.pow(t, 1.5) * DEPTH;
      const pts: [number, number, number][] = [];
      for (let j = 0; j <= SEGMENTS; j++) {
        const a = (j / SEGMENTS) * Math.PI * 2;
        pts.push([Math.cos(a) * r, yOff, Math.sin(a) * r]);
      }
      rings.push(pts);
    }

    // Ring segments
    for (let i = 0; i < RING_COUNT; i++) {
      const pts = rings[i];
      const c: [number, number, number] = i < 3 ? GLOW : WEB;
      for (let j = 0; j < pts.length - 1; j++)
        seg(pts[j][0], pts[j][1], pts[j][2], pts[j + 1][0], pts[j + 1][1], pts[j + 1][2], c);
    }

    // Radial strands
    for (let i = 0; i < RADIAL_COUNT; i++) {
      const c: [number, number, number] = i % 6 === 0 ? GLOW : DIM;
      for (let j = 0; j < RING_COUNT - 1; j++) {
        const idx = Math.round(i * SEGMENTS / RADIAL_COUNT);
        const p1 = rings[j][idx];
        const p2 = rings[j + 1][idx];
        seg(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], c);
      }
    }

    // Outer highlight ring
    const outerR = MAX_RADIUS + 20;
    const outerY = -DEPTH;
    for (let j = 0; j <= SEGMENTS; j++) {
      const a = (j / SEGMENTS) * Math.PI * 2;
      const p1: [number, number, number] = [Math.cos(a) * outerR, outerY, Math.sin(a) * outerR];
      const a2 = ((j + 1) / SEGMENTS) * Math.PI * 2;
      const p2: [number, number, number] = [Math.cos(a2) * outerR, outerY, Math.sin(a2) * outerR];
      seg(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], [0.4, 0.267, 0.8]);
    }

    return { vertices: new Float32Array(vertices), colors: new Float32Array(colors) };
  }, []);

  // ── Dew-drop particles ──
  const particlePositions = useMemo(() => {
    const positions: number[] = [];
    for (let i = 0; i < RING_COUNT; i++) {
      const t = i / (RING_COUNT - 1);
      const r = MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
      const yOff = -Math.pow(t, 1.5) * DEPTH;
      if (i % 2 !== 0) continue;
      for (let j = 0; j < RADIAL_COUNT; j += 3) {
        const a = (j / RADIAL_COUNT) * Math.PI * 2;
        positions.push(
          Math.cos(a) * r + (Math.random() - 0.5) * 8,
          yOff + (Math.random() - 0.5) * 4,
          Math.sin(a) * r + (Math.random() - 0.5) * 8,
        );
      }
    }
    return new Float32Array(positions);
  }, []);

  // ── Animation ──
  useFrame((_, delta) => {
    if (!webRef.current) return;
    timeRef.current += delta;
    webRef.current.rotation.y += delta * 0.015;
    const breathe = 1 + Math.sin(timeRef.current * 0.2) * 0.008;
    webRef.current.scale.set(breathe, breathe, breathe);
  });

  return (
    <group ref={webRef} position={[0, -100, -600]}>
      {/* Single merged lineSegments — replaces 46 separate <line> draw calls */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={webData.vertices.length / 3}
            array={webData.vertices}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={webData.colors.length / 3}
            array={webData.colors}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial vertexColors toneMapped={false} transparent opacity={0.6} />
      </lineSegments>

      {/* Dew-drop particles */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={particlePositions.length / 3}
            array={particlePositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial color="#aa88ff" size={3} transparent opacity={0.5}
          sizeAttenuation blending={2} />
      </points>

      {/* Central hub glow — reduced segment count */}
      <mesh>
        <sphereGeometry args={[12, 12, 12]} />
        <meshBasicMaterial color="#8866ff" transparent opacity={0.3} />
      </mesh>
      <mesh>
        <sphereGeometry args={[6, 8, 8]} />
        <meshBasicMaterial color="#aa88ff" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}
