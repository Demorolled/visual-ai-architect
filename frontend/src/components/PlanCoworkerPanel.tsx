/**
 * PlanCoworkerPanel — answers the co-worker's questions where they belong.
 *
 * The co-worker (usePlanCoworker → POST /api/plans/cowork) asks about specific
 * nodes. Previously those questions only appeared in the terminal as text, so
 * answering them meant typing prose that was attached to nothing — the decision
 * lived in a transcript instead of on the node it was about.
 *
 * Here each question is shown against the node it concerns, with its own answer
 * box. Submitting files the answer under that node (data.planQa, via
 * answerPlanQuestion), which means it:
 *   • is autosaved into data/plans/<name>/{graph.json,plan.md},
 *   • is sent back to the co-worker so it stops asking and asks the NEXT thing,
 *   • survives reopening the plan, and
 *   • is available to whatever the node is later built from.
 *
 * The panel only appears in Big Plan Mode, and only when there is something to
 * answer — it is not a permanent fixture competing with the canvas.
 */

import { useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import type { PlanQuestion } from '../types';

export default function PlanCoworkerPanel() {
  const planMode = useProjectStore((s) => s.planMode);
  const questions = useProjectStore((s) => s.planQuestions);
  const nodes = useProjectStore((s) => s.nodes);
  const planSeedId = useProjectStore((s) => s.planSeedId);
  const answerPlanQuestion = useProjectStore((s) => s.answerPlanQuestion);
  const dismissPlanQuestion = useProjectStore((s) => s.dismissPlanQuestion);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState(false);

  if (!planMode || questions.length === 0) return null;

  const seedLabel =
    nodes.find((n) => n.id === planSeedId)?.data?.label ||
    nodes.find((n) => n.type !== 'master' && (n.data as any)?.appGoal)?.data?.label ||
    'the app itself';

  const labelFor = (q: PlanQuestion) => {
    if (q.nodeLabel) return q.nodeLabel;
    if (q.nodeId) return nodes.find((n) => n.id === q.nodeId)?.data?.label || q.nodeId;
    // Design-wide question: it will be filed on the seed node.
    return `${seedLabel} (whole design)`;
  };

  const submit = (q: PlanQuestion) => {
    const text = (drafts[q.id] || '').trim();
    if (!text) return;
    answerPlanQuestion(q.id, text);
    setDrafts((d) => {
      const next = { ...d };
      delete next[q.id];
      return next;
    });
  };

  return (
    <div className="plan-coworker">
      <div className="plan-coworker-head">
        <span className="plan-coworker-title">
          🤝 Co-worker — {questions.length} question{questions.length === 1 ? '' : 's'}
        </span>
        <button
          className="plan-coworker-collapse"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Show the questions' : 'Hide the questions'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="plan-coworker-hint">
            Answering attaches the answer to the node it is about. Nothing is built from it yet.
          </div>

          {questions.map((q) => (
            <div key={q.id} className="plan-coworker-question">
              <div className="plan-coworker-target">↳ {labelFor(q)}</div>
              <div className="plan-coworker-text">{q.text}</div>
              <div className="plan-coworker-answer">
                <textarea
                  className="plan-coworker-input"
                  rows={2}
                  maxLength={600}
                  placeholder="Your answer (goes on that node)…"
                  value={drafts[q.id] || ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      submit(q);
                    }
                  }}
                />
                <div className="plan-coworker-actions">
                  <button
                    className="plan-coworker-btn"
                    onClick={() => submit(q)}
                    disabled={!(drafts[q.id] || '').trim()}
                    title="Attach this answer to the node and close the question"
                  >
                    Attach
                  </button>
                  <button
                    className="plan-coworker-btn plan-coworker-btn-ghost"
                    onClick={() => dismissPlanQuestion(q.id)}
                    title="Close without answering"
                  >
                    Skip
                  </button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
