/**
 * SessionHistoryPanel — the "what have we been doing" view inside the
 * floating preview window. Shown when the user asks for the session history
 * (auto-detected in the chat, or via the 📜 button on AI messages).
 *
 * Three tabs:
 *   💬 Conversation — the recent chat from this app's localStorage
 *   🏗 Builds        — build history from /api/session/builds
 *   💾 Sessions      — saved /session-save snapshots from /api/session/list
 */

import { useCallback, useEffect, useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import { loadSession, listSessions, SessionListItem } from '../utils/sessionTunnel';
import { broadcastReasoningMessage } from '../utils/reasoningSync';
import { pushReasoningMessage } from '../utils/sharedTerminalContext';
import type { OSType } from '../types';
import './SessionHistoryPanel.css';

type Tab = 'chat' | 'builds' | 'sessions';

interface ChatMsg {
  role: string;
  text: string;
  timestamp: string;
}

interface BuildRecord {
  projectName: string;
  targetOS: string;
  timestamp: string;
  progress: number;
  nodeCount: number;
  totalNodeCount: number;
  completedNodeCount: number;
  filesCreated: string[];
  nodeStatuses?: Array<{ label: string; status: string }>;
}

const CHAT_STORAGE_KEY = 'reasoning-messages';

function timeAgo(ts: string): string {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch {
    return '';
  }
}

function formatClock(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const OS_ICONS: Record<string, string> = {
  linux: '🐧',
  windows: '🪟',
  mac: '🍎',
  ios: '📱',
  android: '🤖',
};

function loadChat(): ChatMsg[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m: any) => m && typeof m.text === 'string' && m.text.trim())
      .slice(-30)
      .reverse() as ChatMsg[];
  } catch {
    return [];
  }
}

export default function SessionHistoryPanel() {
  const [tab, setTab] = useState<Tab>('chat');
  const [chat, setChat] = useState<ChatMsg[]>(loadChat);

  // ── Builds (from /api/session/builds) ──
  const [builds, setBuilds] = useState<BuildRecord[]>([]);
  const [buildsLoading, setBuildsLoading] = useState(true);
  const [buildsError, setBuildsError] = useState('');

  // ── Saved sessions (from /api/session/list) ──
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState('');
  // Inline status per session code while a load is in flight / completed.
  const [loadStatus, setLoadStatus] = useState<Record<string, string>>({});

  const fetchBuilds = useCallback(async () => {
    setBuildsLoading(true);
    setBuildsError('');
    try {
      const res = await fetch('/api/session/builds', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBuilds(data.buildHistory || []);
    } catch (err: any) {
      setBuildsError(err?.message || 'Failed to load build history');
    } finally {
      setBuildsLoading(false);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError('');
    try {
      const items = await listSessions();
      setSessions(items);
    } catch (err: any) {
      setSessionsError(err?.message || 'Failed to load saved sessions');
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBuilds();
    fetchSessions();
  }, [fetchBuilds, fetchSessions]);

  const handleLoadSession = useCallback(async (s: SessionListItem) => {
    setLoadStatus((prev) => ({ ...prev, [s.code]: '⏳ Loading…' }));
    try {
      const data = await loadSession(s.code);
      if (!data) {
        setLoadStatus((prev) => ({ ...prev, [s.code]: '❌ Not found' }));
        return;
      }
      const st = useProjectStore.getState();
      st.setUserGoal(data.goal || '');
      st.setUserPurpose(data.purpose || '');
      st.setProjectName(data.projectName || 'Untitled');
      st.setTargetOS((data.targetOS as OSType) || 'linux');
      if (data.nodes && data.nodes.length > 0) {
        const masterId = data.nodes.find((n: any) => n.type === 'master')?.id;
        st.replaceNodes(data.nodes, data.edges || [], (data.targetOS as OSType) || 'linux', masterId);
      }
      st.setWizardStep('filling-nodes');
      const msg = `✅ Loaded session **${s.code}** (${data.label || 'Untitled'}) — ${(data.nodes || []).length} nodes restored to the canvas.`;
      broadcastReasoningMessage({ role: 'ai', text: msg, timestamp: new Date().toISOString() });
      pushReasoningMessage('ai', msg);
      setLoadStatus((prev) => ({ ...prev, [s.code]: `✅ Loaded — ${(data.nodes || []).length} nodes on canvas` }));
      // Refresh the chat tab so the confirmation line appears right away.
      setChat(loadChat());
    } catch (err: any) {
      setLoadStatus((prev) => ({ ...prev, [s.code]: `❌ ${err?.message || 'Load failed'}` }));
    }
  }, []);

  return (
    <div className="shp-wrap">
      <div className="shp-tabs">
        <button className={`shp-tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>💬 Conversation</button>
        <button className={`shp-tab ${tab === 'builds' ? 'active' : ''}`} onClick={() => setTab('builds')}>🏗 Builds</button>
        <button className={`shp-tab ${tab === 'sessions' ? 'active' : ''}`} onClick={() => setTab('sessions')}>💾 Sessions</button>
      </div>

      {tab === 'chat' && (
        <div className="shp-body">
          <div className="shp-hint">Recent conversation — the messages shown below are also persisted across reloads.</div>
          {chat.length === 0 ? (
            <div className="shp-empty">No conversation yet. Say hi or ask me to build something!</div>
          ) : (
            chat.map((m, i) => (
              <div key={i} className={`shp-chat-row ${m.role === 'user' ? 'user' : 'ai'}`}>
                <span className="shp-chat-role">{m.role === 'user' ? '👤 You' : '🤖 LLM 1'}</span>
                <span className="shp-chat-text">{m.text}</span>
                <span className="shp-chat-time">{formatClock(m.timestamp)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'builds' && (
        <div className="shp-body">
          <div className="shp-hint">Apps you've built on this machine — from /api/session/builds.</div>
          {buildsLoading && <div className="shp-state">⏳ Loading build history…</div>}
          {!buildsLoading && buildsError && (
            <div className="shp-state">
              ⚠️ {buildsError}
              <button className="shp-retry" onClick={fetchBuilds}>Retry</button>
            </div>
          )}
          {!buildsLoading && !buildsError && builds.length === 0 && (
            <div className="shp-empty">📭 No builds yet. Generate an app and it will appear here.</div>
          )}
          {!buildsLoading && builds.length > 0 && (
            <div className="shp-list">
              {builds.map((b, i) => (
                <div key={b.timestamp + i} className="shp-build-card">
                  <div className="shp-build-head">
                    <span className="shp-build-name">{OS_ICONS[b.targetOS] || '📦'} {b.projectName}</span>
                    <span className="shp-build-ago">{timeAgo(b.timestamp)}</span>
                  </div>
                  <div className="shp-build-meta">
                    <span className="shp-build-nodes">{b.totalNodeCount ?? b.nodeCount} nodes</span>
                    <span className="shp-build-files">{b.filesCreated?.length || 0} files</span>
                    <div className="shp-progress"><div className="shp-progress-fill" style={{ width: `${b.progress}%` }} /></div>
                    <span className={`shp-progress-text ${b.progress >= 100 ? 'done' : ''}`}>{b.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'sessions' && (
        <div className="shp-body">
          <div className="shp-hint">Saved snapshots — use /session-save in the terminal to create more. Click Load to restore one to the canvas.</div>
          {sessionsLoading && <div className="shp-state">⏳ Loading saved sessions…</div>}
          {!sessionsLoading && sessionsError && (
            <div className="shp-state">
              ⚠️ {sessionsError}
              <button className="shp-retry" onClick={fetchSessions}>Retry</button>
            </div>
          )}
          {!sessionsLoading && !sessionsError && sessions.length === 0 && (
            <div className="shp-empty">📭 No saved sessions. Type <code>/session-save my project</code> in the terminal to create one.</div>
          )}
          {!sessionsLoading && sessions.length > 0 && (
            <div className="shp-list">
              {sessions.map((s) => (
                <div key={s.code} className="shp-session-card">
                  <div className="shp-session-info">
                    <span className="shp-session-label">{s.label || 'Untitled'}</span>
                    <span className="shp-session-code">{s.code}</span>
                    <span className="shp-session-ago">{timeAgo(s.createdAt)}</span>
                  </div>
                  <button
                    className="shp-load-btn"
                    onClick={() => handleLoadSession(s)}
                    disabled={!!loadStatus[s.code] && loadStatus[s.code].startsWith('⏳')}
                  >
                    Load
                  </button>
                  {loadStatus[s.code] && <span className="shp-load-status">{loadStatus[s.code]}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
