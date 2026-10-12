import { useEffect, useRef } from 'react';
import { useProjectStore, isRootNode } from '../store/projectStore';
import { api } from '../api/client';
import { broadcastReasoningMessage } from '../utils/reasoningSync';
import type { PlanQuestion } from '../types';

/**
 * usePlanCoworker — the second person on the team, while Big Plan Mode is on.
 *
 * It watches the design graph and, when the design has moved on, asks the user
 * 1–3 short questions in the terminal. It is deliberately passive:
 *
 *  • It never generates code, files, or a build. Big Plan Mode is design-only,
 *    and the user asked for a co-worker who helps *only when asked* — so nothing
 *    here writes to the canvas or to the project.
 *  • It asks rather than advises. The questions appear in the terminal
 *    (ReasoningPanel) where the user can answer them in their own words, and the
 *    answers land in the design by the user's own hand.
 *  • Questions already asked this session are not repeated: the normalised text
 *    is sent back as `alreadyAsked` and the backend filters on it too, so a
 *    question cannot come back around after the graph changes again.
 *
 * Change detection is by *design signature* (node ids + labels + purposes +
 * edges + answers), so drags and camera moves never trigger a call — only
 * edits that change what the design actually says.
 *
 * Each question comes back tagged with the node it is about, and is put in the
 * store (not a transcript) so the panel can let the user answer it in place and
 * file the answer under that node.
 */

const DEBOUNCE_MS = 9000;

/** Mirror of the autosave's strip-down: app-tree roots are not part of the user's design. */
function designSignature() {
  const st = useProjectStore.getState();
  const nodes = st.nodes
    .filter((n) => !isRootNode(n))
    .map((n) => {
      const d = n.data as any;
      const qa = (d?.planQa || []).map((x: any) => `${x.q}=>${x.a}`).join('/');
      return [n.id, d?.type || n.type, d?.label || '', d?.description || '', d?.language || '', qa].join('|');
    })
    .sort();
  const edges = st.edges
    .map((e) => `${e.source}>${e.target}`)
    .sort();
  return `${nodes.join('~')}##${edges.join('~')}`;
}

export function usePlanCoworker() {
  const planMode = useProjectStore((s) => s.planMode);
  const planSeedId = useProjectStore((s) => s.planSeedId);
  // Subscribe to the arrays themselves (not their lengths) so a label or
  // purpose edit re-runs the watcher — those change the design but not the
  // count, and are exactly the edits worth asking about.
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const goal = useProjectStore((s) => s.userGoal);
  const projectName = useProjectStore((s) => s.projectName);

  const askedRef = useRef<string[]>([]);
  const lastSigRef = useRef('');
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!planMode) {
      // Leaving Plan Mode clears the watch so re-entering starts fresh, but the
      // asked-question log is kept per session to avoid repeating questions.
      lastSigRef.current = '';
      return;
    }
    // Nothing to reason from until the master node exists.
    if (!planSeedId) return;

    const sig = designSignature();
    if (sig === lastSigRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (runningRef.current) return;
      const st = useProjectStore.getState();
      // Re-read the store at fire time: the user may have edited again.
      const nodes = st.nodes
        .filter((n) => !isRootNode(n))
        .map((n) => {
          const d = n.data as any;
          return {
            id: n.id,
            type: d?.type || n.type || 'logic',
            label: d?.label || n.id,
            description: d?.description || '',
            language: d?.language,
            isMaster: n.id === st.planSeedId,
            // Answers already given: the co-worker is told them and must not
            // re-ask, and the backend filters near-duplicates against them too.
            qa: (d?.planQa || []).map((x: any) => ({ q: x.q, a: x.a })),
          };
        });
      if (nodes.length === 0) return;

      runningRef.current = true;
      lastSigRef.current = designSignature();
      try {
        const res = await api.coworkPlan({
          projectName: st.projectName,
          goal: st.userGoal,
          nodes,
          edges: st.edges.map((e) => ({
            source: e.source,
            target: e.target,
            label: (e as any).label,
          })),
          alreadyAsked: askedRef.current,
        });
        const raw: Array<{ text?: string; nodeId?: string | null; nodeLabel?: string | null }> =
          res.data?.questions || [];
        const questions: PlanQuestion[] = raw
          .filter((q) => typeof q?.text === 'string' && q.text.trim())
          .map((q, i) => ({
            id: `${Date.now().toString(36)}_${i}`,
            text: q.text!.trim(),
            nodeId: q.nodeId ?? null,
            nodeLabel: q.nodeLabel ?? null,
            at: new Date().toISOString(),
          }));
        if (questions.length) {
          askedRef.current = [...askedRef.current, ...questions.map((q) => q.text)];
          // Store them so the panel can show each one against its node…
          useProjectStore.getState().setPlanQuestions(questions);
          // …and mirror them into the terminal, where the user already watches
          // the design happen.
          const text =
            questions.length === 1
              ? `🤝 ${questions[0].text}`
              : `🤝 ${questions.map((q) => `• ${q.text}`).join('\n')}`;
          broadcastReasoningMessage({
            role: 'ai',
            text,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        // Advisory only — a co-worker that cannot reach the model must not
        // interrupt the design, so this stays silent.
      } finally {
        runningRef.current = false;
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // nodes/edges/goal are here to re-run the watcher when the design changes;
    // the signature check above decides whether that is an actual edit.
  }, [planMode, planSeedId, nodes, edges, goal, projectName]);

  return { askedQuestions: askedRef.current };
}
