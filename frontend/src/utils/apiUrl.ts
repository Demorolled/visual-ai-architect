/**
 * Centralized API URL resolver.
 *
 * When running in a browser (dev or backend-served), relative `/api/...` paths
 * resolve correctly because the frontend and backend share an origin.
 *
 * When running inside a Capacitor APK on a physical Android device, the app
 * loads from a local Capacitor server, so relative `/api/...` calls would go
 * to the wrong place. This utility allows the user to configure the backend
 * IP address so all API calls go to the correct host.
 */

import axios from 'axios';

const BACKEND_URL_KEY = 'vaia-backend-url';
const DEFAULT_BACKEND_HOST = 'localhost:3001';

function isCapacitor(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    typeof (window as any).Capacitor !== 'undefined' ||
    navigator.userAgent.includes('Capacitor')
  );
}

export function getBackendUrl(): string {
  if (typeof window === 'undefined') return `http://${DEFAULT_BACKEND_HOST}`;

  // Only use the stored URL when running inside Capacitor APK.
  // In browser mode, relative /api/... paths work correctly.
  if (!isCapacitor()) return '';

  // Check if user has configured a custom backend URL
  const stored = localStorage.getItem(BACKEND_URL_KEY);
  if (stored && stored.trim()) {
    let url = stored.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }
    return url.replace(/\/+$/, '');
  }

  // On a real device with no configured URL, return empty to signal unconfigured
  return '';
}

export function setBackendUrl(url: string): void {
  localStorage.setItem(BACKEND_URL_KEY, url);
}

export function getBackendUrlStored(): string {
  return localStorage.getItem(BACKEND_URL_KEY) || '';
}

export function resolveApiUrl(path: string): string {
  const base = getBackendUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}

/**
 * Check if the backend is reachable. Tries to fetch /health.
 * In browser mode, tries relative /health first, then falls back to localhost:3001.
 */
export async function checkBackendConnection(url?: string): Promise<boolean> {
  const base = url || getBackendUrl();
  if (base) {
    // Capacitor mode with configured URL
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }
  // Browser mode — actually test the connection instead of assuming it works
  // Try relative /health (works when backend serves frontend or Vite proxy forwards it)
  try {
    const res = await fetch('/health', { signal: AbortSignal.timeout(3000) });
    if (res.ok) return true;
  } catch { /* /health not available at this path */ }
  // Fallback: try direct localhost:3001 (Vite proxy doesn't proxy /health)
  try {
    const res = await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Try to discover the backend automatically on the local network.
 * Checks common IPs and the host machine's typical addresses.
 *
 * Scans a broader range of common gateway IPs and subnet addresses
 * to find a running backend server on port 3001.
 */
export async function autoDiscoverBackend(): Promise<string | null> {
  // Build candidate list: common gateway addresses for various subnets
  const baseCandidates = [
    // Localhost / emulator
    'localhost:3001',
    '127.0.0.1:3001',
    '10.0.2.2:3001',  // Android emulator -> host
    // Common home/office subnets (.1 is usually the gateway, but the server
    // could be on .100-.254 range too — we check the most common host IPs)
    '192.168.1.1:3001',
    '192.168.1.100:3001',
    '192.168.1.101:3001',
    '192.168.1.102:3001',
    '192.168.0.1:3001',
    '192.168.0.100:3001',
    '192.168.0.101:3001',
    '192.168.0.102:3001',
    '192.168.0.10:3001',
    '192.168.1.10:3001',
    '10.0.0.1:3001',
    '10.0.0.100:3001',
    '10.0.0.101:3001',
    '10.0.1.1:3001',
    '10.0.1.100:3001',
    '172.16.0.1:3001',
    '172.16.0.100:3001',
  ];

  // Also try to discover via mDNS/local discovery if available
  try {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      // We're already on the network — try the current hostname
      baseCandidates.unshift(`${hostname}:3001`);
    }
  } catch {}

  // De-duplicate while preserving order
  const seen = new Set<string>();
  const candidates = baseCandidates.filter(c => {
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });

  for (const candidate of candidates) {
    try {
      const res = await fetch(`http://${candidate}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        setBackendUrl(`http://${candidate}`);
        return `http://${candidate}`;
      }
    } catch {
      continue;
    }
  }

  return null;
}

// ─── Axios interceptor ──────────────────────────────────────────────────

export function applyAxiosInterceptor(): void {
  axios.interceptors.request.use((config) => {
    const url = config.url || '';
    if (url.startsWith('/api/') || url.startsWith('/health')) {
      const base = getBackendUrl();
      if (base) {
        config.url = `${base}${url}`;
      }
    }
    return config;
  });
}

// ─── Global fetch override ─────────────────────────────────────────────

export function applyFetchOverride(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let urlStr: string;
    if (typeof input === 'string') {
      urlStr = input;
    } else if (input instanceof URL) {
      urlStr = input.toString();
    } else {
      // Request object
      urlStr = input.url;
    }

    if (urlStr.startsWith('/api/') || urlStr.startsWith('/health')) {
      const base = getBackendUrl();
      if (base) {
        const newUrl = `${base}${urlStr}`;
        if (typeof input === 'string') {
          return originalFetch(newUrl, init);
        }
        return originalFetch(newUrl, { ...init });
      }
    }

    return originalFetch(input, init);
  };
}
