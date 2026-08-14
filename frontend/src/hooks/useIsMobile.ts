import { useState, useEffect } from 'react';

function detectMobile(): boolean {
  // Check 1: Capacitor runtime
  if (
    typeof (window as any).Capacitor !== 'undefined' ||
    navigator.userAgent.includes('Capacitor')
  ) {
    return true;
  }

  // Check 2: Match media query (most reliable for screen size)
  try {
    if (window.matchMedia('(max-width: 768px)').matches) {
      return true;
    }
  } catch {}

  // Check 3: Android / mobile user agent
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    return true;
  }

  // Check 4: Screen width
  if (window.innerWidth <= 900) {
    return true;
  }

  return false;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(detectMobile);

  useEffect(() => {
    // Re-check on resize (e.g. rotating a tablet)
    const handleResize = () => {
      setIsMobile(detectMobile());
    };
    window.addEventListener('resize', handleResize);
    // Also check matchMedia change (more reliable than resize for orientation)
    const mql = window.matchMedia('(max-width: 768px)');
    const handleMql = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    try { mql.addEventListener('change', handleMql); } catch {}
    return () => {
      window.removeEventListener('resize', handleResize);
      try { mql.removeEventListener('change', handleMql); } catch {}
    };
  }, []);

  return isMobile;
}
