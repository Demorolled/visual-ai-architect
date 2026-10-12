export function parseQuery(url: string): Record<string, string> {
  const q = url.split('?')[1];
  if (!q) return {};
  const pairs = q.split('&');
  const result: Record<string, string> = {};
  for (const p of pairs) {
    const [k, v] = p.split('=');
    result[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return result;
}