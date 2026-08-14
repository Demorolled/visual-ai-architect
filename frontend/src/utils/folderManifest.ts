/**
 * folderManifest.ts — build a compact, prompt-ready manifest of a dropped
 * folder so the LLM can describe what's inside it.
 *
 * Used by FileDropHandler's "Describe Folder Contents" action: the browser
 * reads the dropped folder recursively (webkitGetAsEntry), producing a flat
 * list of { path, content }; these helpers turn that into a structured
 * summary + file tree + content samples for the model.
 */

export interface ManifestFile {
  path: string;
  content: string;
}

/** Common top-level folder name if all files share one (e.g. "myapp/src/a.ts" → "myapp"). */
export function detectFolderRoot(files: ManifestFile[]): string | null {
  if (files.length === 0) return null;
  const roots = new Set<string>();
  for (const f of files) {
    const first = f.path.split('/')[0];
    if (first) roots.add(first);
  }
  return roots.size === 1 ? [...roots][0] : null;
}

/** Extension histogram, e.g. { ts: 12, html: 2, json: 1 }. */
export function extensionCounts(files: ManifestFile[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of files) {
    const ext = (f.path.split('.').pop() || 'unknown').toLowerCase();
    counts[ext] = (counts[ext] || 0) + 1;
  }
  return counts;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Build the manifest string sent to the LLM. Caps the number of listed files
 * and the snippet size per file so huge folders don't blow the context window.
 */
export function buildFolderManifest(
  files: ManifestFile[],
  opts?: { maxFiles?: number; maxContentChars?: number; maxSampleFiles?: number }
): string {
  const maxFiles = opts?.maxFiles ?? 200;
  const maxContentChars = opts?.maxContentChars ?? 800;
  const maxSampleFiles = opts?.maxSampleFiles ?? 8;

  const root = detectFolderRoot(files);
  const totalBytes = files.reduce((sum, f) => sum + f.content.length, 0);
  const counts = extensionCounts(files);
  const extSummary = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([ext, n]) => `${ext} (${n})`)
    .join(', ');

  const lines: string[] = [];
  lines.push(`Folder root: ${root ?? '(multiple top-level items)'}`);
  lines.push(`Files: ${files.length} | Approx size: ${formatBytes(totalBytes)}`);
  lines.push(`File types: ${extSummary || 'unknown'}`);
  lines.push('');
  lines.push('File tree (paths):');
  const shown = files.slice(0, maxFiles);
  for (const f of shown) lines.push(`  ${f.path}`);
  if (files.length > maxFiles) lines.push(`  ... and ${files.length - maxFiles} more`);

  const sampled = shown.filter((f) => f.content.trim()).slice(0, maxSampleFiles);
  if (sampled.length > 0) {
    lines.push('');
    lines.push('Sample contents (truncated):');
    for (const f of sampled) {
      lines.push(`--- ${f.path} ---`);
      lines.push(f.content.trim().slice(0, maxContentChars));
    }
  }

  return lines.join('\n');
}
