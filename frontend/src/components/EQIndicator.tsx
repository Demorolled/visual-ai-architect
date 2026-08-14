import { useEffect, useRef, useState } from 'react';
import { SPEAKING_START_EVENT, SPEAKING_STOP_EVENT } from '../utils/tts';
import VeronicaPrism from './VeronicaPrism';
import './EQIndicator.css';

export default function EQIndicator() {
  const [speaking, setSpeaking] = useState(false);
  const rafRef = useRef<number>(0);
  const prismRef = useRef<HTMLDivElement>(null);

  // Listen for speaking events
  useEffect(() => {
    const onStart = () => setSpeaking(true);
    const onStop = () => setSpeaking(false);
    window.addEventListener(SPEAKING_START_EVENT, onStart);
    window.addEventListener(SPEAKING_STOP_EVENT, onStop);
    return () => {
      window.removeEventListener(SPEAKING_START_EVENT, onStart);
      window.removeEventListener(SPEAKING_STOP_EVENT, onStop);
    };
  }, []);

  // Gentle pulse animation when speaking
  useEffect(() => {
    if (!speaking) {
      if (prismRef.current) {
        prismRef.current.style.transform = 'scale(1)';
        prismRef.current.style.opacity = '1';
      }
      return;
    }

    let running = true;

    function animate() {
      if (!running || !prismRef.current) return;
      // Subtle pulse — oscillate scale + opacity
      const scale = 1 + Math.random() * 0.12;
      const opacity = 0.75 + Math.random() * 0.25;
      prismRef.current.style.transform = `scale(${scale})`;
      prismRef.current.style.opacity = String(opacity);
      rafRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [speaking]);

  return (
    <div className={`eq-indicator ${speaking ? 'speaking' : ''}`} title={speaking ? 'Veronica speaking...' : 'Veronica idle'}>
      <div className="eq-circle">
        <div className={`eq-glow ${speaking ? 'active' : ''}`} />
        <div className="eq-prism-wrap" ref={prismRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', zIndex: 1, position: 'relative' }}>
          <VeronicaPrism width={20} height={24} />
        </div>
      </div>
    </div>
  );
}
