/**
 * PlanPanel — VACA Plan Mode.
 *
 * Captures the user's app ideas and saves them to a text file
 * (data/plans/<project-name>.txt) so they can be built later in Build Mode.
 *
 * Behavior:
 * - The user defines a project name; if they try to save without one, the
 *   panel asks for it (inline prompt + focus).
 * - "✨ Help me plan" asks the LLM to guide the user: it asks clarifying
 *   questions and suggests structure for the plan.
 * - Save writes the plan file. After the first successful save, edits
 *   auto-save (debounced) under the same project name.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import { api } from '../api/client';
import './PlanPanel.css';

interface PlanPanelProps {
  onClose: () => void;
}

const PLANNER_SYSTEM =
  'You are VACA\'s Plan Mode assistant. The user is planning an app before building it. ' +
  'Help by: (1) asking the 2-4 most important clarifying questions about their idea, and ' +
  '(2) giving a short structural suggestion (main features/modules). Be helpful, warm, and ' +
  'guide them step by step. Format your reply as:\n' +
  'Guidance: <your advice and structural suggestion>\n' +
  'Questions: <bullet list of clarifying questions>';

export default function PlanPanel({ onClose }: PlanPanelProps) {
  const storeProjectName = useProjectStore(s => s.projectName);
  const setProjectName = useProjectStore(s => s.setProjectName);

  const [name, setName] = useState(storeProjectName && storeProjectName !== 'Untitled Project' ? storeProjectName : '');
  const [ideas, setIdeas] = useState('');
  const [guidance, setGuidance] = useState('');
  const [questions, setQuestions] = useState('');

  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [savedPath, setSavedPath] = useState('');
  const [needName, setNeedName] = useState(false);
  const [assisting, setAssisting] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const lastSavedRef = useRef<string>('');
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameAtFirstSaveRef = useRef<string>('');

  // ── Save the plan (create or update) ──
  const persist = useCallback(async (projectName: string): Promise<boolean> => {
    const trimmedName = projectName.trim();
    if (!trimmedName) {
      setNeedName(true);
      setStatus('error');
      setStatusMsg('Please give this plan a project name so I can save it for later creation.');
      setTimeout(() => nameRef.current?.focus(), 0);
      return false;
    }
    if (!ideas.trim()) {
      setStatus('error');
      setStatusMsg('Add a few ideas first — tell me what you want to build.');
      return false;
    }
    setNeedName(false);
    setStatus('saving');
    setStatusMsg(trimmedName !== nameAtFirstSaveRef.current && nameAtFirstSaveRef.current ? 'Auto-saving changes...' : 'Saving plan...');
    try {
      const res = await api.savePlan({
        projectName: trimmedName,
        ideas,
        guidance,
        questions,
      });
      const data = res.data;
      setSavedPath(data.filePath || '');
      lastSavedRef.current = trimmedName;
      if (!nameAtFirstSaveRef.current) nameAtFirstSaveRef.current = trimmedName;
      // Keep the store project name in sync so Build Mode uses the same name.
      if (useProjectStore.getState().projectName !== trimmedName) {
        setProjectName(trimmedName);
      }
      setStatus('saved');
      setStatusMsg(`✅ Plan saved to ${data.fileName} — ready to build later.`);
      return true;
    } catch (err: any) {
      const need = err?.response?.status === 400 && err?.response?.data?.needName;
      if (need) setNeedName(true);
      setStatus('error');
      setStatusMsg(err?.response?.data?.error || err?.message || 'Failed to save plan');
      if (need) setTimeout(() => nameRef.current?.focus(), 0);
      return false;
    }
  }, [ideas, guidance, questions, setProjectName]);

  // ── Auto-save: once a plan exists, save edits after 2s of inactivity.
  //    Saves to lastSavedRef.current (the established project name); `name` is
  //    intentionally NOT a dependency — typing in the name field must not
  //    retarget the debounced write to a brand-new file.
  useEffect(() => {
    if (!lastSavedRef.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      persist(lastSavedRef.current);
    }, 2000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [ideas, guidance, questions, persist]);

  // ── LLM assistance: guiding questions + structure ──
  const handleAssist = useCallback(async () => {
    setAssisting(true);
    setStatusMsg('Asking VACA for guidance...');
    try {
      const res = await fetch('/api/reason', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: ideas || name || 'a new app idea', system: PLANNER_SYSTEM, maxTokens: 700 }),
      });
      const data = await res.json();
      const reply = (data.response || '').trim();
      // Split at the first "Questions:" occurrence (inline or on its own line)
      const qIdx = reply.search(/Questions:/i);
      if (qIdx !== -1) {
        setGuidance(reply.slice(0, qIdx).replace(/^Guidance:\s*/i, '').trim());
        setQuestions(reply.slice(qIdx + 'Questions:'.length).trim());
      } else {
        // No structured split — keep everything as guidance, prompt for questions separately
        setGuidance(reply.replace(/^Guidance:\s*/i, '').trim());
        setQuestions('');
      }
      setStatus('saved');
      setStatusMsg('✨ Guidance ready — review it, answer the questions, then Save the plan.');
    } catch (err: any) {
      setStatus('error');
      setStatusMsg(`Guidance failed: ${err.message}`);
    } finally {
      setAssisting(false);
    }
  }, [ideas, name]);

  const handleSave = useCallback(() => {
    const target = name.trim() || lastSavedRef.current;
    persist(target);
  }, [name, persist]);

  // Clear a stale saved/error status as soon as the user edits anything.
  const clearStatus = useCallback(() => {
    if (status === 'saved' || status === 'error') setStatus('idle');
  }, [status]);

  const handleClose = useCallback(() => {
    if (status === 'saving' || assisting) return;
    onClose();
  }, [status, assisting, onClose]);

  return (
    <div className="plan-overlay" onClick={handleClose}>
      <div className="plan-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="plan-header">
          <div className="plan-header-left">
            <span className="plan-mode-badge">📋 PLAN MODE</span>
            <h2 className="plan-title">Plan Your App</h2>
          </div>
          <button className="plan-close-btn" onClick={handleClose} title="Close">✕</button>
        </div>
        <div className="plan-subtitle">
          Capture your ideas here — VACA saves them to a text file so you can build them later in Build Mode.
        </div>

        {/* Body */}
        <div className="plan-body">
          {/* Project Name */}
          <div className={`plan-field ${needName ? 'plan-field-error' : ''}`}>
            <label className="plan-label">
              Project Name
              {lastSavedRef.current && <span className="plan-label-hint">(auto-saving to {lastSavedRef.current})</span>}
            </label>
            <input
              ref={nameRef}
              className="plan-input"
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setNeedName(false); clearStatus(); }}
              placeholder="e.g. Weather Dashboard"
            />
            {needName && (
              <div className="plan-need-name">📛 Please give this plan a name so I can save it for later creation.</div>
            )}
          </div>

          {/* Ideas */}
          <div className="plan-field">
            <label className="plan-label">Your Ideas / Notes</label>
            <textarea
              className="plan-textarea"
              rows={6}
              value={ideas}
              onChange={e => { setIdeas(e.target.value); clearStatus(); }}
              placeholder={'Describe your app idea...\n\nExample: "A habit tracker that shows streaks, sends reminders, and lets me export my data."'}
            />
          </div>

          {/* AI Guidance */}
          <div className="plan-field">
            <div className="plan-label-row">
              <label className="plan-label">AI Guidance &amp; Clarifying Questions</label>
              <button
                className="plan-assist-btn"
                onClick={handleAssist}
                disabled={assisting || status === 'saving'}
              >
                {assisting ? '⏳ Asking VACA...' : '✨ Help me plan'}
              </button>
            </div>
            <textarea
              className="plan-textarea plan-textarea-guidance"
              rows={4}
              value={guidance}
              onChange={e => { setGuidance(e.target.value); clearStatus(); }}
              placeholder="VACA will ask clarifying questions and suggest structure when you click ✨ Help me plan."
            />
            <textarea
              className="plan-textarea plan-textarea-questions"
              rows={3}
              value={questions}
              onChange={e => { setQuestions(e.target.value); clearStatus(); }}
              placeholder="Open questions to answer before building…"
            />
          </div>

          {/* Status */}
          {status !== 'idle' && (
            <div className={`plan-status ${status === 'error' ? 'error' : status === 'saved' ? 'ok' : ''}`}>
              {statusMsg}
              {status === 'saved' && savedPath && (
                <div className="plan-saved-path">📁 {savedPath}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="plan-footer">
          <span className="plan-footer-hint">
            {lastSavedRef.current
              ? 'Auto-save is on — edits are written to your plan file.'
              : 'You\'ll be asked for a project name if you haven\'t set one.'}
          </span>
          <div className="plan-footer-actions">
            <button className="plan-btn plan-btn-secondary" onClick={handleClose}>Close</button>
            <button
              className="plan-btn plan-btn-primary"
              onClick={handleSave}
              disabled={status === 'saving' || assisting}
            >
              {status === 'saving' ? '⏳ Saving...' : '💾 Save Plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
