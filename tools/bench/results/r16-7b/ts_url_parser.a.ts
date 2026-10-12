export function parseQuery(url: string): Record<string, string> {
  const q = url.split('?')[1];
  if (!q) return {};
  const pairs = q.split('&').map(p => p.split('='));
  return pairs.reduce((acc, [k, v]) => {
    acc[decodeURIComponent(k)] = decodeURIComponent(v || '');
    return acc;
  }, {} as Record<string, string>);
}