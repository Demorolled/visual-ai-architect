import { useEffect, useRef } from 'react';
import { useProjectStore, isRootNode } from '../store/projectStore';
import { api } from '../api/client';
import { broadcastReasoningMessage } from '../utils/reasoningSync';

/**
 * usePlanAutosave — keeps a Big Plan Mode design on disk.
 *
 * The design lives on the canvas, which is a bad place for the only copy of an
 * hour's thinking. So while Big Plan Mode is on, the graph is written to
 * data/plans/<project>/ every 5 minutes, and immediately once the master node
 * exists — that first write is what creates the plan's files and folders.
 *
 * Deliberately NOT generating anything: this saves the design (plan.md +
 * graph.json). Compiling it into an app is a separate, deliberate step.
 *
 * Saves are skipped when nothing changed, and throttled, because the user is
 * editing the graph continuously and a save per keystroke-drag would be noise in
 * the terminal for no benefit.
 */

const AUTOSAVE_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 20 * 1000;

function note(text: string) {
  // The terminal panel on screen is ReasoningPanel, and it listens on the
  // REASONING channel. terminalSync's `broadcastMessage` looks like the obvious
  // channel for terminal lines, but nothing in this app subscribes to it
  // (`subscribeTerminal` is never called), so anything sent there is silently
  // dropped. Verified by grepping for subscribers before wiring this up.
  broadcastReasoningMessage({ role: 'ai', text, timestamp: new Date().toISOString() });
}

export function usePlanAutosave() {
  const planMode = useProjectStore(s => s.planMode);
  const planSeedId = useProjectStore(s => s.planSeedId);
  const lastRef = useRef('');
  const lastAtRef = useRef(0);

  useEffect(() => {
    if (!planMode) return;

    const snapshot = () => {
      const st = useProjectStore.getState();
      const nodes = st.nodes
        // Root nodes are the app's own blueprint (one per app tree), not part of
        // the user's plan — the plan's master node is whichever node they
        // placed as seed.
        .filter((n) => !isRootNode(n))
        .map((n) => ({
          id: n.id,
          type: (n.data as any)?.type || n.type || 'logic',
          label: (n.data as any)?.label || n.id,
          description: (n.data as any)?.description || '',
          language: (n.data as any)?.language,
          isMaster: n.id === st.planSeedId,
          // The co-worker's questions and the user's answers ride with the node
          // they belong to, so reopening the plan restores the decisions too.
          qa: (n.data as any)?.planQa || [],
        }));
      const edges = st.edges.map((e) => ({
        source: e.source,
        target: e.target,
        label: (e as any).label,
      }));
      return { projectName: st.projectName, goal: st.userGoal, nodes, edges };
    };

    const save = async (why: string) => {
      const payload = snapshot();
      if (payload.nodes.length === 0) return; // nothing designed yet
      const key = JSON.stringify(payload);
      if (key === lastRef.current) return; // unchanged since last save
      const now = Date.now();
      if (now - lastAtRef.current < MIN_GAP_MS) return;
      lastAtRef.current = now;
      lastRef.current = key;
      try {
        const res = await api.savePlanGraph(payload);
        const dir = res.data?.dirName || payload.projectName;
        note(
          `💾 plan ${why} → data/plans/${dir}/  (plan.md + graph.json · ` +
            `${payload.nodes.length} node${payload.nodes.length === 1 ? '' : 's'}, ` +
            `${payload.edges.length} edge${payload.edges.length === 1 ? '' : 's'})`,
        );
      } catch (err: any) {
        note(`⚠ plan autosave failed: ${err?.message || 'unknown error'}`);
      }
    };

    // First save happens the moment the master node lands (planSeedId changes),
    // which is also what creates the plan's files and folders.
    save('started');
    const interval = setInterval(() => save('autosaved'), AUTOSAVE_MS);
    return () => clearInterval(interval);
  }, [planMode, planSeedId]);
}
