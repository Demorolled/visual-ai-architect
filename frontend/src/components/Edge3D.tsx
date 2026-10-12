import { useMemo, memo, useRef, useEffect } from 'react';
import { Vector3, Quaternion, CatmullRomCurve3 } from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { useProjectStore } from '../store/projectStore';

interface Edge3DProps {
  id: string;
  source: string;
  target: string;
  /** Semantic metadata for user-described connections (Connect & Describe). */
  data?: any;
  /**
   * Just connected — draw an attention pulse so the user can SEE the new edge
   * land on the canvas immediately after applying a connection.
   */
  highlighted?: boolean;
}

/**
 * Edge3D — dispatches between two render styles:
 *  - regular edges: spider-silk strand (luminous web aesthetic)
 *  - SEMANTIC edges (edge.data.semantic === true): a green "wiring cable" with
 *    the connection label, the interpreted relation, a direction arrowhead and
 *    animated data-flow orbs travelling source → target. Semantic edges are the
 *    user-described connections between two merged apps, so they must read as
 *    deliberate wiring, distinct from the ambient web.
 */
function Edge3D({ source, target, data, highlighted = false }: Edge3DProps) {
  if (data?.semantic === true) {
    return <SemanticCableEdge source={source} target={target} data={data} highlighted={highlighted} />;
  }
  return <SpiderSilkEdge source={source} target={target} highlighted={highlighted} />;
}

export default memo(Edge3D);

/* ═══════════════════════════════════════════════════════════════════════════
   Spider-silk edge — luminous strand spun by a spider jumping between nodes.
   Features a traveling spider particle, iridescent glow, and dew drops.
   ═══════════════════════════════════════════════════════════════════════════ */
function SpiderSilkEdge({ source, target, highlighted = false }: { source: string; target: string; highlighted?: boolean }) {
  const nodes = useProjectStore((s) => s.nodes);
  const sourcePos = nodes.find((n) => n.id === source)?.position;
  const targetPos = nodes.find((n) => n.id === target)?.position;

  const mainRef = useRef<any>(null);
  const supportRef = useRef<any>(null);
  const spiderRef = useRef<any>(null);
  const spiderProgress = useRef(Math.random()); // 0-1, unique start position per edge

  // Phase offset per edge
  const flowPhase = useMemo(() => {
    let hash = 0;
    const key = source + target;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 1000;
    return (hash / 1000) * Math.PI * 2;
  }, [source, target]);

  // ── Build the silk curve ──
  const { curve, points, rawPositions, supportRaw, spiderStop } = useMemo(() => {
    if (!sourcePos || !targetPos) return { curve: null, points: [] as Vector3[], rawPositions: [] as number[], supportRaw: [] as number[], spiderStop: 0 };

    const sx = sourcePos.x, sy = sourcePos.y;
    const tx = targetPos.x, ty = targetPos.y;
    const distance = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2);

    // Spider silk sag — deeper sag = more web-like tension
    const sagDepth = Math.min(25 + distance * 0.06, 100);
    const p1 = new Vector3(sx, -2, sy);
    const c1 = new Vector3(sx + (tx - sx) * 0.3, -sagDepth * 0.65, sy + (ty - sy) * 0.3);
    const c2 = new Vector3(sx + (tx - sx) * 0.7, -sagDepth * 0.65, sy + (ty - sy) * 0.7);
    const p2 = new Vector3(tx, -2, ty);

    const c = new CatmullRomCurve3([p1, c1, c2, p2]);
    const pts = c.getPoints(28);
    const raw = pts.flatMap(p => [p.x, p.y, p.z]);

    // Support strand — thinner, deeper sag
    const sag2 = sagDepth * 1.4;
    const sp1 = new Vector3(sx, -4, sy);
    const sc1 = new Vector3(sx + (tx - sx) * 0.25, -sag2 * 0.5, sy + (ty - sy) * 0.25);
    const sc2 = new Vector3(sx + (tx - sx) * 0.75, -sag2 * 0.5, sy + (ty - sy) * 0.75);
    const sp2 = new Vector3(tx, -4, ty);
    const sCurve = new CatmullRomCurve3([sp1, sc1, sc2, sp2]);
    const sPts = sCurve.getPoints(16);
    const sRaw = sPts.flatMap(p => [p.x, p.y, p.z]);

    // Where the spider stops before reaching the node (leaves a gap for crawling onto node)
    const spiderStop = 0.88;

    return { curve: c, points: pts, rawPositions: raw, supportRaw: sRaw, spiderStop };
  }, [sourcePos?.x, sourcePos?.y, targetPos?.x, targetPos?.y]);

  // ── Dew drops ──
  const dewDrops = useMemo(() => {
    if (!curve) return new Float32Array();
    const count = 4 + Math.floor(Math.abs(flowPhase * 2) % 4);
    const positions: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const pt = curve.getPoint(t);
      positions.push(
        pt.x + (Math.random() - 0.5) * 4,
        pt.y - 1 + Math.sin(t * 10 + flowPhase) * 2,
        pt.z + (Math.random() - 0.5) * 4
      );
    }
    return new Float32Array(positions);
  }, [curve, flowPhase]);

  // Compute line distances for the dashed support strand
  useEffect(() => {
    if (supportRef.current) supportRef.current.computeLineDistances();
  }, [supportRaw]);

  // ── Animation: spider jumps + silk glow ──
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    // ── Spider jumps along the strand ──
    if (curve) {
      // Move forward, loop back when reaching the end
      const speed = 0.06 + Math.abs(Math.sin(flowPhase)) * 0.04;
      spiderProgress.current += delta * speed;
      if (spiderProgress.current > 1) spiderProgress.current -= 1;

      // Ease — spider accelerates toward middle, slows at ends (like a real jump)
      const raw = spiderProgress.current;
      const eased = raw < 0.5
        ? 2 * raw * raw
        : 1 - Math.pow(-2 * raw + 2, 2) / 2;

      const pos = curve.getPoint(eased * spiderStop);
      if (spiderRef.current) {
        spiderRef.current.position.copy(pos);
      }
    }

    // ── Silk glow pulse with iridescent shift ──
    if (mainRef.current) {
      const mat = mainRef.current.material as any;
      if (highlighted) {
        // Attention pulse: bright, fast throb so the fresh edge is unmissable.
        mat.opacity = 0.8 + Math.sin(t * 4) * 0.2;
        mat.color.setHSL(0.6, 0.9, 0.6);
      } else {
        mat.opacity = 0.4 + Math.sin(t * 0.5 + flowPhase) * 0.18;
        const hueShift = Math.sin(t * 0.3 + flowPhase) * 0.05;
        mat.color.setHSL(0.72 + hueShift, 0.7, 0.5);
      }
    }
  });

  if (!sourcePos || !targetPos || !curve || points.length === 0) return null;

  return (
    <group>
      {/* ── Main silk strand ── */}
      <line ref={mainRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={points.length}
            array={new Float32Array(rawPositions)}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color="#8866ff"
          transparent
          opacity={0.4}
          linewidth={1}
        />
      </line>

      {/* ── Support strand ── */}
      {supportRaw.length > 0 && (
        <line ref={supportRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={supportRaw.length / 3}
              array={new Float32Array(supportRaw)}
              itemSize={3}
            />
          </bufferGeometry>
          <lineDashedMaterial
            color="#5544aa"
            dashSize={4}
            gapSize={6}
            transparent
            opacity={0.12}
          />
        </line>
      )}

      {/* ── Dew drops ── */}
      {dewDrops.length > 0 && (
        <points>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={dewDrops.length / 3}
              array={dewDrops}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            color="#ccaaff"
            size={4}
            transparent
            opacity={0.55}
            sizeAttenuation
            blending={2}
          />
        </points>
      )}

      {/* ── Traveling spider (group so all parts move together) ── */}
      <group ref={spiderRef}>
        {/* Body */}
        <mesh>
          <sphereGeometry args={[3, 8, 8]} />
          <meshBasicMaterial color="#1a0a2e" />
        </mesh>
        {/* Eye glows */}
        <mesh position={[0, 0.8, 2.5]}>
          <sphereGeometry args={[0.8, 6, 6]} />
          <meshBasicMaterial color="#ff4444" />
        </mesh>
        <mesh position={[0, -0.8, 2.5]}>
          <sphereGeometry args={[0.8, 6, 6]} />
          <meshBasicMaterial color="#ff4444" />
        </mesh>
        {/* Glow aura */}
        <mesh>
          <sphereGeometry args={[5, 8, 8]} />
          <meshBasicMaterial color="#8866ff" transparent opacity={0.15} />
        </mesh>
      </group>

      {/* ── Anchor glows ── */}
      <mesh position={[sourcePos.x, -2, sourcePos.y]}>
        <sphereGeometry args={[3, 8, 8]} />
        <meshBasicMaterial color="#8866ff" transparent opacity={0.25} />
      </mesh>
      <mesh position={[targetPos.x, -2, targetPos.y]}>
        <sphereGeometry args={[3, 8, 8]} />
        <meshBasicMaterial color="#8866ff" transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Semantic cable — green wiring between two merged apps, with:
    - a glowing tube + core cable (deliberate "wire", not ambient web)
    - a dashed flow overlay and travelling orbs moving source → target
      (data flows out of the source into the target — VACA edge semantics)
    - an arrowhead near the target showing direction
    - a camera-facing label with the connection name + interpreted relation
   ═══════════════════════════════════════════════════════════════════════════ */
function SemanticCableEdge({ source, target, data, highlighted = false }: { source: string; target: string; data?: any; highlighted?: boolean }) {
  const nodes = useProjectStore((s) => s.nodes);
  const sourcePos = nodes.find((n) => n.id === source)?.position;
  const targetPos = nodes.find((n) => n.id === target)?.position;

  const glowRef = useRef<any>(null);
  const pulseRef = useRef<any>(null);
  const labelGroupRef = useRef<any>(null);
  const flowRef = useRef<any>(null);
  const orbRefA = useRef<any>(null);
  const orbRefB = useRef<any>(null);
  const orbA = useRef(0.2 + Math.random() * 0.3);
  const orbB = useRef(0.6 + Math.random() * 0.3);

  // ── Build the wiring curve — a gentle upward bow so the label has room ──
  const { curve, points, apex, arrow, orbStartA, orbStartB } = useMemo(() => {
    if (!sourcePos || !targetPos) {
      return {
        curve: null,
        points: [] as Vector3[],
        apex: null as Vector3 | null,
        arrow: null as { pos: Vector3; quat: Quaternion } | null,
        orbStartA: new Vector3(),
        orbStartB: new Vector3(),
      };
    }
    const sx = sourcePos.x, sy = sourcePos.y;
    const tx = targetPos.x, ty = targetPos.y;
    const distance = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2);
    const lift = 12 + Math.min(distance * 0.035, 60);

    const p1 = new Vector3(sx, -1, sy);
    const c1 = new Vector3(sx + (tx - sx) * 0.33, lift * 0.5, sy + (ty - sy) * 0.33);
    const c2 = new Vector3(sx + (tx - sx) * 0.67, lift * 0.5, sy + (ty - sy) * 0.67);
    const p2 = new Vector3(tx, -1, ty);
    const c = new CatmullRomCurve3([p1, c1, c2, p2]);

    const arrowPos = c.getPoint(0.84);
    const arrowDir = c.getTangent(0.84).normalize();
    const arrowQuat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), arrowDir);

    return {
      curve: c,
      points: c.getPoints(28),
      apex: c.getPoint(0.5),
      arrow: { pos: arrowPos, quat: arrowQuat },
      // Pre-place the orbs so they never flash at the world origin on frame 1.
      orbStartA: c.getPoint(orbA.current * 0.88),
      orbStartB: c.getPoint(orbB.current * 0.88),
    };
  }, [sourcePos?.x, sourcePos?.y, targetPos?.x, targetPos?.y]);

  // Compute line distances for the dashed flow overlay
  useEffect(() => {
    if (flowRef.current) flowRef.current.computeLineDistances();
  }, [points]);

  // ── Animation: orbs flow source → target, label faces camera, glow pulses ──
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    // Billboard the label toward the camera so it is always readable while orbiting
    if (labelGroupRef.current) {
      labelGroupRef.current.quaternion.copy(state.camera.quaternion);
    }

    // Data-flow orbs travelling source → target along the cable
    if (curve) {
      const speed = highlighted ? 2.4 : 1;
      orbA.current = (orbA.current + delta * 0.12 * speed) % 1;
      orbB.current = (orbB.current + delta * 0.085 * speed) % 1;
      if (orbRefA.current) orbRefA.current.position.copy(curve.getPoint(orbA.current * 0.88));
      if (orbRefB.current) orbRefB.current.position.copy(curve.getPoint(orbB.current * 0.88));
    }

    // Soft breathing glow on the outer tube — much stronger right after a
    // connection is applied so the new edge is obvious on the canvas.
    if (glowRef.current) {
      const m = glowRef.current.material as any;
      m.opacity = highlighted
        ? 0.32 + Math.sin(t * 3) * 0.16
        : 0.1 + Math.sin(t * 1.3) * 0.045;
    }

    // Expanding pulse ring at the cable apex as a "just connected" beacon.
    if (pulseRef.current) {
      const s = 1 + (Math.sin(t * 3) * 0.5 + 0.5) * 2.2;
      pulseRef.current.scale.setScalar(s);
      const m = pulseRef.current.material as any;
      m.opacity = Math.max(0, 0.5 - (s - 1) * 0.22);
    }
  });

  if (!sourcePos || !targetPos || !curve || !apex || !arrow) return null;

  const label = (data?.label || 'connection').slice(0, 40);
  const relation = (data?.relation || '').slice(0, 56);

  return (
    <group>
      {/* ── Glow tube (wide, faint) ── */}
      <mesh ref={glowRef}>
        <tubeGeometry args={[curve, 24, 3.4, 8, false]} />
        <meshBasicMaterial color="#4ade80" transparent opacity={0.12} />
      </mesh>

      {/* ── Core cable ── */}
      <mesh>
        <tubeGeometry args={[curve, 24, highlighted ? 1.7 : 1.15, 8, false]} />
        <meshBasicMaterial color={highlighted ? '#6ee7b7' : '#34d399'} transparent opacity={0.9} />
      </mesh>

      {/* ── "Just connected" pulse beacon at the cable apex ── */}
      {highlighted && (
        <mesh ref={pulseRef} position={[apex.x, apex.y, apex.z]}>
          <sphereGeometry args={[7, 16, 16]} />
          <meshBasicMaterial color="#a7f3d0" transparent opacity={0.5} />
        </mesh>
      )}

      {/* ── Dashed flow overlay ── */}
      <line ref={flowRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={points.length}
            array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
            itemSize={3}
          />
        </bufferGeometry>
        <lineDashedMaterial color="#a7f3d0" dashSize={6} gapSize={4} transparent opacity={0.55} />
      </line>

      {/* ── Data-flow orbs (source → target) ── */}
      <group ref={orbRefA} position={orbStartA}>
        <mesh>
          <sphereGeometry args={[1.8, 8, 8]} />
          <meshBasicMaterial color="#d1fae5" />
        </mesh>
        <mesh>
          <sphereGeometry args={[3.2, 8, 8]} />
          <meshBasicMaterial color="#4ade80" transparent opacity={0.18} />
        </mesh>
      </group>
      <group ref={orbRefB} position={orbStartB}>
        <mesh>
          <sphereGeometry args={[1.3, 8, 8]} />
          <meshBasicMaterial color="#a7f3d0" />
        </mesh>
        <mesh>
          <sphereGeometry args={[2.4, 8, 8]} />
          <meshBasicMaterial color="#4ade80" transparent opacity={0.16} />
        </mesh>
      </group>

      {/* ── Direction arrowhead near the target ── */}
      <mesh position={arrow.pos} quaternion={arrow.quat}>
        <coneGeometry args={[4, 9, 12]} />
        <meshBasicMaterial color="#4ade80" transparent opacity={0.85} />
      </mesh>

      {/* ── Camera-facing label: connection name + relation ── */}
      <group ref={labelGroupRef} position={[apex.x, apex.y + 15, apex.z]}>
        <Text
          fontSize={11}
          color="#a7f3d0"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor="#0b1020"
        >
          {label}
        </Text>
        {relation && (
          <Text
            position={[0, -15, 0]}
            fontSize={7.5}
            color="#6ee7b7"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.025}
            outlineColor="#0b1020"
          >
            {relation}
          </Text>
        )}
      </group>

      {/* ── Anchor glows ── */}
      <mesh position={[sourcePos.x, -1, sourcePos.y]}>
        <sphereGeometry args={[3, 8, 8]} />
        <meshBasicMaterial color="#4ade80" transparent opacity={0.25} />
      </mesh>
      <mesh position={[targetPos.x, -1, targetPos.y]}>
        <sphereGeometry args={[3, 8, 8]} />
        <meshBasicMaterial color="#4ade80" transparent opacity={0.25} />
      </mesh>
    </group>
  );
}
