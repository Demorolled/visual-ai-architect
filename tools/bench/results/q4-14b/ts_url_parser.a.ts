export function parseQuery(url: string): Record<string, string> {
  const q = url.split('?')[1];
  if (!q) return {};
  return q.split('&').reduce<Record<string, string>>((acc, p) => {
    const [k, v] = p.split('=');
    if (k) acc[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
    return acc;
  }, {});
}