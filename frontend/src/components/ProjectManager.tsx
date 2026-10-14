import { useState, useCallback, useRef, useEffect } from 'react';
import { useProjectStore, SavedProject } from '../store/projectStore';
import { speak, warmupAudio } from '../utils/tts';
import ManifestoEditor from './ManifestoEditor';
import SoulSettings from './SoulSettings';
import MergeProjectsDialog from './MergeProjectsDialog';
import LLMSelector from './LLMSelector';
import './ProjectManager.css';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const typeColors: Record<string, string> = {
  input: '#4ade80',
  output: '#f87171',
  logic: '#60a5fa',
  api: '#a78bfa',
  database: '#fbbf24',
  ui: '#f472b6',
};

function ProjectCard({ project, onDelete }: { project: SavedProject; onDelete: () => void }) {
  const { loadProject, deleteProject, setProjectName, saveProject } = useProjectStore();
  const [showConfirm, setShowConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);

  const handleLoad = useCallback(() => {
    loadProject(project.id);
    setProjectName(project.name);
  }, [project.id, project.name, loadProject, setProjectName]);

  const handleDelete = useCallback(() => {
    deleteProject(project.id);
    onDelete();
  }, [project.id, deleteProject, onDelete]);

  const handleRename = useCallback(() => {
    if (name.trim()) {
      setProjectName(name.trim());
      saveProject();
      setEditing(false);
    }
  }, [name, setProjectName, saveProject]);

  const nodeCount = project.nodes.length;
  const edgeCount = project.edges.length;

  return (
    <div className="project-card">
      <div className="project-card-header">
        {editing ? (
          <input
            className="project-card-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') { setEditing(false); setName(project.name); }
            }}
            autoFocus
          />
        ) : (
          <span
            className="project-card-name"
            onClick={() => setEditing(true)}
            title="Click to rename"
          >
            {project.name}
          </span>
        )}
        <span className="project-card-version">v{project.version}</span>
      </div>

      <div className="project-card-meta">
        <span className="project-card-date">{formatDate(project.savedAt)}</span>
        <span className="project-card-stats">
          <span className="stat-nodes">{nodeCount} nodes</span>
          <span className="stat-edges">{edgeCount} edges</span>
        </span>
      </div>

      {nodeCount > 0 && (
        <div className="project-card-types">
          {Object.entries(
            project.nodes.reduce<Record<string, number>>((acc, n) => {
              const t = (n.data?.type as string) || 'unknown';
              acc[t] = (acc[t] || 0) + 1;
              return acc;
            }, {})
          ).map(([type, count]) => (
            <span
              key={type}
              className="type-badge"
              style={{ borderColor: typeColors[type] || '#666' }}
            >
              <span className="type-dot" style={{ backgroundColor: typeColors[type] || '#666' }} />
              {type} ({count})
            </span>
          ))}
        </div>
      )}

      <div className="project-card-actions">
        <button className="project-btn load-btn" onClick={handleLoad}>
          Load
        </button>
        <button className="project-btn rename-btn" onClick={() => setEditing(true)}>
          Rename
        </button>
        {showConfirm ? (
          <div className="confirm-delete">
            <span>Delete?</span>
            <button className="confirm-yes" onClick={handleDelete}>Yes</button>
            <button className="confirm-no" onClick={() => setShowConfirm(false)}>No</button>
          </div>
        ) : (
          <button className="project-btn delete-btn" onClick={() => setShowConfirm(true)}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

const EDGE_VOICES = [
  { name: 'en-US-AriaNeural', gender: 'Female', desc: 'Positive, Confident' },
  { name: 'en-US-JennyNeural', gender: 'Female', desc: 'Friendly, Considerate' },
  { name: 'en-US-AndrewNeural', gender: 'Male', desc: 'Warm, Confident' },
  { name: 'en-US-BrianNeural', gender: 'Male', desc: 'Approachable, Casual' },
  { name: 'en-US-ChristopherNeural', gender: 'Male', desc: 'Reliable, Authority' },
  { name: 'en-US-EricNeural', gender: 'Male', desc: 'Rational' },
  { name: 'en-US-GuyNeural', gender: 'Male', desc: 'Passion' },
  { name: 'en-US-RogerNeural', gender: 'Male', desc: 'Lively' },
];

function TtsSettingsPanel({ onClose }: { onClose: () => void }) {
  const [voice, setVoice] = useState(() => localStorage.getItem('tts-voice') || 'en-US-JennyNeural');
  const [pitch, setPitch] = useState(() => parseFloat(localStorage.getItem('tts-pitch') || '1'));
  const [speed, setSpeed] = useState(() => parseFloat(localStorage.getItem('tts-speed') || '1'));
  const [volume, setVolume] = useState(() => parseFloat(localStorage.getItem('tts-volume') || '1'));
  const [bass, setBass] = useState(() => parseFloat(localStorage.getItem('tts-bass') || '0'));
  const [mid, setMid] = useState(() => parseFloat(localStorage.getItem('tts-mid') || '0'));
  const [high, setHigh] = useState(() => parseFloat(localStorage.getItem('tts-high') || '0'));
  const [echo, setEcho] = useState(() => parseFloat(localStorage.getItem('tts-echo') || '0'));

  const persist = () => {
    localStorage.setItem('tts-voice', voice);
    localStorage.setItem('tts-pitch', String(pitch));
    localStorage.setItem('tts-speed', String(speed));
    localStorage.setItem('tts-volume', String(volume));
    localStorage.setItem('tts-bass', String(bass));
    localStorage.setItem('tts-mid', String(mid));
    localStorage.setItem('tts-high', String(high));
    localStorage.setItem('tts-echo', String(echo));
  };

  const handleSave = () => {
    persist();
    onClose();
  };

  const handleTest = () => {
    persist();
    warmupAudio();
    speak('Hello. This is a test of your TTS settings.');
  };

  const slider = (label: string, val: number, set: (v: number) => void, min: number, max: number, step: number) => (
    <label className="settings-field">
      <span>{label} ({val.toFixed(step < 1 ? 2 : 0)})</span>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(parseFloat(e.target.value))} />
    </label>
  );

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <span>TTS Settings</span>
          <button className="settings-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="settings-modal-body">
          <label className="settings-field">
            <span>Voice</span>
            <select value={voice} onChange={(e) => setVoice(e.target.value)}>
              {EDGE_VOICES.map((v) => (
                <option key={v.name} value={v.name}>{v.name} ({v.gender})</option>
              ))}
            </select>
          </label>
          {slider('1. Pitch', pitch, setPitch, 0.3, 2, 0.05)}
          {slider('2. Speed', speed, setSpeed, 0.3, 3, 0.05)}
          {slider('3. Volume', volume, setVolume, 0, 1, 0.05)}
          {slider('4. Bass', bass, setBass, -12, 12, 1)}
          {slider('5. Mid', mid, setMid, -12, 12, 1)}
          {slider('6. High', high, setHigh, -12, 12, 1)}
          {slider('7. Echo', echo, setEcho, 0, 1, 0.05)}
        </div>
        <div className="settings-modal-footer">
          <button className="settings-test-btn" onClick={handleTest}>🔊 Test</button>
          <button className="settings-save-btn" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectManager() {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ttsOpen, setTtsOpen] = useState(false);
  const [manifestoOpen, setManifestoOpen] = useState(false);
  const [soulOpen, setSoulOpen] = useState(false);
  const [llmConnectOpen, setLlmConnectOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [fastPreview, setFastPreview] = useState(() => localStorage.getItem('vaia-fast-preview') === 'true');
  // Auto GUI Preview — when ON (default), the chat auto-opens the planned-interface
  // mockup when it senses a build request. Disabling only stops the AUTO popup;
  // the explicit 🖥 Show Preview button and ⚡ Build This Now still work.
  const [autoPreview, setAutoPreview] = useState(() => localStorage.getItem('vaia-auto-preview') !== 'false');
  const [highlightAutoPreview, setHighlightAutoPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Open the settings dropdown on request (preview toast → Auto GUI Preview
  //    toggle), briefly highlighting the Auto GUI Preview row so the user can
  //    find the setting that controls the popup. ──
  const settingsOpenToken = useProjectStore(s => s.settingsOpenToken);
  useEffect(() => {
    if (settingsOpenToken === 0) return;
    setSettingsOpen(true);
    setHighlightAutoPreview(true);
    const t = setTimeout(() => setHighlightAutoPreview(false), 3000);
    return () => clearTimeout(t);
  }, [settingsOpenToken]);
  const settingsRef = useRef<HTMLDivElement>(null);

  const { loadProjects, saveProject, importProject } = useProjectStore();

  const refreshProjects = useCallback(() => {
    setProjects(loadProjects());
  }, [loadProjects]);

  const handleOpen = useCallback(() => {
    setProjects(loadProjects());
    setOpen(true);
  }, [loadProjects]);

  const handleSave = useCallback(() => {
    saveProject();
  }, [saveProject]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const json = ev.target?.result as string;
        const result = importProject(json);
        if (result) {
          setProjects(loadProjects());
        } else {
          alert('Invalid project file');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [importProject, loadProjects]
  );

  const handleExport = useCallback(() => {
    const state = useProjectStore.getState();
    const json = {
      id: state.projectId || 'unsaved',
      name: state.projectName,
      targetOS: state.targetOS,
      nodes: state.nodes,
      edges: state.edges,
      savedAt: new Date().toISOString(),
      version: 1,
    };

    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${json.name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    if (settingsOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [settingsOpen]);

  return (
    <>
      <div className="project-controls">
        <button className="project-control-btn new-btn" onClick={() => { if (confirm('Start a new build? All current data will be lost.')) { const name = localStorage.getItem('vaia-user-name'); localStorage.clear(); if (name) localStorage.setItem('vaia-user-name', name); fetch('/api/memory/clear', { method: 'POST' }).catch(() => {}); window.location.reload(); } }} title="Start a new build">
          New
        </button>
        <button className="project-control-btn save-btn" onClick={handleSave} title="Save project">
          Save
        </button>
        <button className="project-control-btn" onClick={handleOpen} title="Load project">
          Load
        </button>
        <button className="project-control-btn" onClick={handleExport} title="Export as JSON">
          Export
        </button>
        <button className="project-control-btn" onClick={handleImport} title="Import project file">
          Import
        </button>
        <button
          className="project-control-btn merge-btn"
          onClick={() => setMergeOpen(true)}
          title="Merge two projects into one — resolves collisions automatically"
        >
          🔀 Merge
        </button>
        <div className="settings-wrapper" ref={settingsRef}>
          <button
            className={`project-control-btn settings-btn ${settingsOpen ? 'active' : ''}`}
            onClick={() => setSettingsOpen((v) => !v)}
            title="Settings"
          >
            Settings
          </button>
          {settingsOpen && (
            <div className="settings-dropdown">
              <div className="settings-dropdown-header">Settings</div>
              <div className="settings-dropdown-body">
                <button className="settings-menu-item" onClick={() => { setSettingsOpen(false); setTtsOpen(true); }}>
                  <span className="settings-menu-icon">🔊</span>
                  <span>TTS Settings</span>
                </button>
                <button className="settings-menu-item" onClick={() => { setSettingsOpen(false); setManifestoOpen(true); }}>
                  <span className="settings-menu-icon">🎨</span>
                  <span>Design Manifesto</span>
                </button>
                <button className="settings-menu-item" onClick={() => { setSettingsOpen(false); setSoulOpen(true); }}>
                  <span className="settings-menu-icon">🧠</span>
                  <span>Soul Personality</span>
                </button>
                <button className="settings-menu-item" onClick={() => { setSettingsOpen(false); setLlmConnectOpen(true); }}>
                  <span className="settings-menu-icon">🔌</span>
                  <span>LLM Connect</span>
                </button>
                <div className="settings-divider" />
                <label className="settings-menu-item settings-toggle-row" onClick={(e) => {
                  e.preventDefault();
                  const next = !fastPreview;
                  setFastPreview(next);
                  localStorage.setItem('vaia-fast-preview', String(next));
                  // Sync with backend
                  fetch('/api/fast-preview-preference', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled: next }),
                  }).catch(() => {});
                }}>
                  <span className="settings-menu-icon">⚡</span>
                  <span className="settings-toggle-label">Fast Preview Mode</span>
                  <span className={`settings-toggle-switch ${fastPreview ? 'on' : ''}`}>
                    <span className="settings-toggle-knob" />
                  </span>
                </label>
                <label className={`settings-menu-item settings-toggle-row ${highlightAutoPreview ? 'highlight' : ''}`} onClick={(e) => {
                  e.preventDefault();
                  const next = !autoPreview;
                  setAutoPreview(next);
                  localStorage.setItem('vaia-auto-preview', String(next));
                }}>
                  <span className="settings-menu-icon">🎨</span>
                  <span className="settings-toggle-label">Auto GUI Preview</span>
                  <span className={`settings-toggle-switch ${autoPreview ? 'on' : ''}`}>
                    <span className="settings-toggle-knob" />
                  </span>
                </label>
              </div>
            </div>
          )}
          {ttsOpen && <TtsSettingsPanel onClose={() => setTtsOpen(false)} />}
          {manifestoOpen && <ManifestoEditor onClose={() => setManifestoOpen(false)} />}
          {soulOpen && <SoulSettings onClose={() => setSoulOpen(false)} />}
          {llmConnectOpen && (
            <div className="settings-modal-overlay llm-connect-overlay" onClick={() => setLlmConnectOpen(false)}>
              <div className="settings-modal llm-connect-modal" onClick={(e) => e.stopPropagation()}>
                <div className="settings-modal-header">
                  <span>🔌 LLM Connect</span>
                  <button className="settings-modal-close" onClick={() => setLlmConnectOpen(false)}>✕</button>
                </div>
                <div className="settings-modal-body llm-connect-body">
                  <p className="llm-connect-intro">
                    Connect a local LLM provider (Ollama, LM Studio, etc.) alongside VACA's trained model — the dspark ✓ badge shows the tuned model. Select a provider, then pick a model to route chat & code generation through it.
                  </p>
                  <LLMSelector />
                </div>
              </div>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {mergeOpen && <MergeProjectsDialog onClose={() => setMergeOpen(false)} />}

      {open && (
        <div className="project-modal-overlay" onClick={() => setOpen(false)}>
          <div className="project-modal" onClick={(e) => e.stopPropagation()}>
            <div className="project-modal-header">
              <h2>Saved Projects</h2>
              <button className="project-modal-close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <div className="project-modal-body">
              {projects.length === 0 ? (
                <p className="no-projects">No saved projects yet. Save your first project!</p>
              ) : (
                <div className="project-list">
                  {projects.map((p) => (
                    <ProjectCard key={p.id} project={p} onDelete={refreshProjects} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
