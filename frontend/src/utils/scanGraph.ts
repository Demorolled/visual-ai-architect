/**
 * Resolving a scan's connections onto canvas node ids.
 *
 * A scan describes connections between two *things*:
 *   - two modules (`Combat imports Inventory`) — what the LLM scan produces, and
 *   - two files (`src/App.tsx imports ./TaskList`) — what a measured REA scan
 *     produces, because at directory granularity a flat source tree collapses to
 *     "src imports src" and the connection disappears.
 *
 * The canvas has a node for every module and a node per file, but only for the
 * first few files of each module — the rest fold into a "+N more files" node. A
 * connection whose file has no node of its own must still be drawn, at the
 * module level, rather than dropped: the import is measured, so the choice is
 * which node to attach it to, never whether to show it.
 */

export interface ScanEndpointMaps {
  /** Module label → its module node id (every scanned module has one). */
  moduleLabels: Record<string, string>;
  /** File path → its own node id (only files that got one within the cap). */
  fileNodes: Record<string, string>;
  /** File path → the id of the module node that owns it (every file). */
  moduleOfFile: Record<string, string>;
}

export interface ScannedConnection {
  source: string;
  target: string;
  description?: string;
}

export interface ResolvedConnection {
  source: string;
  target: string;
  description: string;
}

/** The node a connection end should attach to, or undefined when nothing matches. */
export function resolveScanEndpoint(key: string, maps: ScanEndpointMaps): string | undefined {
  return maps.moduleLabels[key] || maps.fileNodes[key] || maps.moduleOfFile[key] || undefined;
}

/**
 * Resolve every connection's ends and drop the ones that cannot be drawn:
 * an end with no node at all, or an end that collapses onto the other (both
 * files folded into the same module, so a self-loop would say nothing).
 */
export function resolveScanConnections(
  connections: ScannedConnection[],
  maps: ScanEndpointMaps,
): ResolvedConnection[] {
  const resolved: ResolvedConnection[] = [];
  for (const connection of connections || []) {
    const source = resolveScanEndpoint(connection.source, maps);
    const target = resolveScanEndpoint(connection.target, maps);
    if (!source || !target || source === target) continue;
    resolved.push({ source, target, description: connection.description || '' });
  }
  return resolved;
}
