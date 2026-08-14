import { useState, useRef, useCallback, useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { getAutoSaves, clearAutoSaves, AutoSaveEntry } from '../utils/autoSave';
import './AutoSavePanel.css';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function downloadEntry(entry: AutoSaveEntry) {
  const blob = new Blob([JSON.stringify(entry, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `autosave_${entry.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AutoSavePanel() {
  const [open, setOpen] = useState(false);
  const [saves, setSaves] = useState<AutoSaveEntry[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const projectId = useProjectStore((s) => s.projectId);
  const restoreFromSnapshot = useProjectStore((s) => s.restoreFromSnapshot);

  const refresh = useCallback(() => {
    if (projectId) {
      setSaves(getAutoSaves(projectId));
    } else {
      setSaves([]);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleRestore = useCallback((entry: AutoSaveEntry) => {
    restoreFromSnapshot(entry.snapshot);
    setOpen(false);
  }, [restoreFromSnapshot]);

  const handleClear = useCallback(() => {
    if (projectId && confirm('Delete all auto-saves for this project?')) {
      clearAutoSaves(projectId);
      setSaves([]);
      setOpen(false);
    }
  }, [projectId]);

  const count = saves.length;

  return (
    <div className="autosave-panel" ref={ref}>
      <button
        className="autosave-toggle"
        onClick={() => setOpen((v) => !v)}
        disabled={!projectId}
        title="Auto-save history"
      >
        ⏱ {count > 0 ? count : ''}
      </button>

      {open && (
        <div className="autosave-dropdown">
          <div className="autosave-dropdown-header">
            <span className="autosave-dropdown-title">Auto-saves</span>
            {count > 0 && (
              <button className="autosave-clear-btn" onClick={handleClear}>Clear</button>
            )}
          </div>

          <div className="autosave-list">
            {count === 0 ? (
              <p className="autosave-empty">No auto-saves yet</p>
            ) : (
              saves.map((entry) => (
                <div key={entry.id} className="autosave-item">
                  <div className="autosave-item-info">
                    <span className="autosave-item-time">{formatTime(entry.savedAt)}</span>
                  </div>
                  <div className="autosave-item-actions">
                    <button
                      className="autosave-item-btn restore-btn"
                      onClick={() => handleRestore(entry)}
                      title="Restore this auto-save"
                    >
                      Restore
                    </button>
                    <button
                      className="autosave-item-btn download-btn"
                      onClick={() => downloadEntry(entry)}
                      title="Download as JSON"
                    >
                      Download
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
