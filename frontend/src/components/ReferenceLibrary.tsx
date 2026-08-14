import { useState, useEffect, useCallback } from 'react';
import './ReferenceLibrary.css';

interface LibraryFile {
  name: string;
  title: string;
  description: string;
  modified: string;
  size: number;
}

interface LibraryFileDetail extends LibraryFile {
  content: string;
}

interface BibleLevel {
  dir: string;
  name: string;
  fileCount: number;
  hasMasterIndex: boolean;
}

interface BibleLevelFile {
  name: string;
  path: string;
  size: number;
}

interface BibleLevelDetail {
  level: { dir: string; name: string };
  files: BibleLevelFile[];
  subdirectories: string[];
  masterIndex: string | null;
}

type Tab = 'library' | 'bible';

export default function ReferenceLibrary({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('library');
  const [search, setSearch] = useState('');

  // Library tab state
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [selectedFile, setSelectedFile] = useState<LibraryFileDetail | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  // Bible tab state
  const [levels, setLevels] = useState<BibleLevel[]>([]);
  const [loadingLevels, setLoadingLevels] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<BibleLevelDetail | null>(null);
  const [loadingLevelContent, setLoadingLevelContent] = useState(false);
  const [bibleFileContent, setBibleFileContent] = useState<string | null>(null);
  const [selectedBibleFileName, setSelectedBibleFileName] = useState<string | null>(null);
  const [loadingBibleFile, setLoadingBibleFile] = useState(false);

  // Load library files on mount
  useEffect(() => {
    if (tab !== 'library') return;
    (async () => {
      setLoadingFiles(true);
      try {
        const res = await fetch('/api/library');
        if (res.ok) {
          const data = await res.json();
          if (data.success) setFiles(data.files);
        }
      } catch { /* backend may be offline */ }
      setLoadingFiles(false);
    })();
  }, [tab]);

  // Load Bible levels when tab switches
  useEffect(() => {
    if (tab !== 'bible') return;
    (async () => {
      setLoadingLevels(true);
      try {
        const res = await fetch('/api/library/bible/levels');
        if (res.ok) {
          const data = await res.json();
          if (data.success) setLevels(data.levels);
        }
      } catch { /* backend may be offline */ }
      setLoadingLevels(false);
    })();
  }, [tab]);

  // Load a library file's content
  const openFile = useCallback(async (filename: string) => {
    setSelectedBibleFileName(null);
    setLoadingContent(true);
    try {
      const res = await fetch(`/api/library/${encodeURIComponent(filename)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setSelectedFile(data.file);
      }
    } catch { /* */ }
    setLoadingContent(false);
  }, []);

  // Load a Bible level
  const openLevel = useCallback(async (levelDir: string) => {
    setBibleFileContent(null);
    setSelectedBibleFileName(null);
    setLoadingLevelContent(true);
    try {
      const res = await fetch(`/api/library/bible/${encodeURIComponent(levelDir)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setSelectedLevel(data);
      }
    } catch { /* */ }
    setLoadingLevelContent(false);
  }, []);

  // Load a Bible file's content
  const openBibleFile = useCallback(async (path: string, name: string) => {
    setSelectedFile(null);
    setSelectedBibleFileName(name);
    setLoadingBibleFile(true);
    try {
      const res = await fetch(`/api/library/bible/${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setBibleFileContent(data.file.content);
      }
    } catch { /* */ }
    setLoadingBibleFile(false);
  }, []);

  // Go back to level list
  const backToLevels = useCallback(() => {
    setSelectedLevel(null);
    setBibleFileContent(null);
    setSelectedBibleFileName(null);
  }, []);

  // Go back to file list
  const backToFiles = useCallback(() => {
    setSelectedFile(null);
  }, []);

  // Go back from Bible file to level view
  const backToLevelDetail = useCallback(() => {
    setBibleFileContent(null);
    setSelectedBibleFileName(null);
  }, []);

  // Filter
  const filteredFiles = files.filter(f =>
    !search || f.title.toLowerCase().includes(search.toLowerCase()) ||
    f.description.toLowerCase().includes(search.toLowerCase())
  );

  const filteredLevels = levels.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase())
  );

  // Render Markdown content as basic HTML
  const renderMarkdown = (content: string) => {
    const lines = content.split('\n');
    const html: string[] = [];
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let codeLang = '';

    const flushCodeBlock = () => {
      if (codeBlockLines.length > 0) {
        html.push(`<pre><code class="language-${codeLang}">${escapeHtml(codeBlockLines.join('\n'))}</code></pre>`);
        codeBlockLines = [];
        codeLang = '';
      }
    };

    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          flushCodeBlock();
          inCodeBlock = false;
        } else {
          flushCodeBlock();
          inCodeBlock = true;
          codeLang = line.trim().slice(3).trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        continue;
      }

      const trimmed = line.trim();

      // Headings
      if (trimmed.startsWith('### ')) {
        html.push(`<h4>${escapeHtml(trimmed.slice(4))}</h4>`);
        continue;
      }
      if (trimmed.startsWith('## ')) {
        html.push(`<h3>${escapeHtml(trimmed.slice(3))}</h3>`);
        continue;
      }
      if (trimmed.startsWith('# ')) {
        html.push(`<h2>${escapeHtml(trimmed.slice(2))}</h2>`);
        continue;
      }

      // Horizontal rule
      if (trimmed.match(/^[-*_]{3,}$/)) {
        html.push('<hr />');
        continue;
      }

      // List items
      if (trimmed.startsWith('- ')) {
        html.push(`<li>${escapeHtml(trimmed.slice(2))}</li>`);
        continue;
      }
      if (trimmed.match(/^\d+\.\s/)) {
        html.push(`<li>${escapeHtml(trimmed.replace(/^\d+\.\s/, ''))}</li>`);
        continue;
      }

      // Empty line
      if (!trimmed) {
        html.push('</p><p>');
        continue;
      }

      // Regular paragraph text — support bold, code spans
      let processed = escapeHtml(trimmed);
      processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');
      html.push(processed + ' ');
    }

    flushCodeBlock();

    return `<div class="rl-markdown"><p>${html.join('\n')}</p></div>`;
  };

  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  return (
    <>
      <div className="rl-overlay-bg" onClick={onClose} />
      <div className="rl-sidebar">
        <div className="rl-header">
          <span className="rl-title">📚 Reference Library</span>
          <button className="rl-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="rl-tabs">
          <button
            className={`rl-tab ${tab === 'library' ? 'active' : ''}`}
            onClick={() => { setTab('library'); setSelectedFile(null); setSelectedLevel(null); setBibleFileContent(null); setSearch(''); }}
          >
            📖 Library
          </button>
          <button
            className={`rl-tab ${tab === 'bible' ? 'active' : ''}`}
            onClick={() => { setTab('bible'); setSelectedLevel(null); setBibleFileContent(null); setSelectedFile(null); setSearch(''); }}
          >
            📜 Bible
          </button>
        </div>

        {/* Search */}
        {!selectedFile && !selectedLevel && !bibleFileContent && (
          <div className="rl-search">
            <input
              type="text"
              placeholder={tab === 'library' ? 'Search library files...' : 'Search Bible levels...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rl-search-input"
              autoFocus
            />
          </div>
        )}

        {/* Content Area */}
        <div className="rl-content">
          {/* ── Library Tab ── */}
          {tab === 'library' && !selectedFile && (
            <>
              {loadingFiles ? (
                <div className="rl-loading">Loading library files...</div>
              ) : filteredFiles.length === 0 ? (
                <div className="rl-empty">
                  {search ? 'No files match your search.' : 'No library files found.'}
                </div>
              ) : (
                <div className="rl-file-list">
                  {filteredFiles.map((file) => (
                    <div
                      key={file.name}
                      className="rl-file-card"
                      onClick={() => openFile(file.name)}
                    >
                      <div className="rl-file-card-title">{file.title}</div>
                      <div className="rl-file-card-desc">{file.description}</div>
                      <div className="rl-file-card-meta">
                        <span>{(file.size / 1024).toFixed(1)} KB</span>
                        <span>{new Date(file.modified).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Library File Content ── */}
          {tab === 'library' && selectedFile && (
            <div className="rl-file-view">
              <div className="rl-file-view-header">
                <button className="rl-back-btn" onClick={backToFiles}>← Back</button>
                <span className="rl-file-view-title">{selectedFile.title}</span>
              </div>
              {loadingContent ? (
                <div className="rl-loading">Loading...</div>
              ) : (
                <div
                  className="rl-file-content"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedFile.content) }}
                />
              )}
            </div>
          )}

          {/* ── Bible Tab: Level List ── */}
          {tab === 'bible' && !selectedLevel && !bibleFileContent && (
            <>
              {loadingLevels ? (
                <div className="rl-loading">Loading Bible levels...</div>
              ) : filteredLevels.length === 0 ? (
                <div className="rl-empty">
                  {search ? 'No levels match your search.' : 'No Bible levels found.'}
                </div>
              ) : (
                <div className="rl-file-list">
                  {filteredLevels.map((level) => (
                    <div
                      key={level.dir}
                      className="rl-file-card"
                      onClick={() => openLevel(level.dir)}
                    >
                      <div className="rl-file-card-title">{level.name}</div>
                      <div className="rl-file-card-meta">
                        <span>{level.fileCount} files</span>
                        {level.hasMasterIndex && <span className="rl-has-index">📑 Index</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Bible Tab: Level Detail ── */}
          {tab === 'bible' && selectedLevel && !bibleFileContent && (
            <div className="rl-file-view">
              <div className="rl-file-view-header">
                <button className="rl-back-btn" onClick={backToLevels}>← All Levels</button>
                <span className="rl-file-view-title">{selectedLevel.level.name}</span>
              </div>
              {loadingLevelContent ? (
                <div className="rl-loading">Loading...</div>
              ) : (
                <>
                  {/* Master Index section for this level */}
                  {selectedLevel.masterIndex && (
                    <div className="rl-master-index">
                      <div className="rl-master-index-label">📑 Level Overview</div>
                      <pre className="rl-master-index-content">{selectedLevel.masterIndex}</pre>
                    </div>
                  )}

                  {/* File list */}
                  <div className="rl-level-files-header">
                    Files ({selectedLevel.files.length})
                  </div>
                  {selectedLevel.files.length === 0 ? (
                    <div className="rl-empty">No files in this level.</div>
                  ) : (
                    <div className="rl-file-list">
                      {selectedLevel.files.map((file) => (
                        <div
                          key={file.path}
                          className="rl-file-card rl-bible-file-card"
                          onClick={() => openBibleFile(file.path, file.name)}
                        >
                          <div className="rl-file-card-title">
                            <span className="rl-file-icon">📄</span>
                            {file.name}
                          </div>
                          <div className="rl-file-card-meta">
                            <span>{(file.size / 1024).toFixed(1)} KB</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Bible Tab: File Content ── */}
          {tab === 'bible' && bibleFileContent && (
            <div className="rl-file-view">
              <div className="rl-file-view-header">
                <button className="rl-back-btn" onClick={backToLevelDetail}>← {selectedLevel?.level.name}</button>
                <span className="rl-file-view-title rl-bible-file-title">
                  📄 {selectedBibleFileName || 'File'}
                </span>
              </div>
              {loadingBibleFile ? (
                <div className="rl-loading">Loading...</div>
              ) : (
                <div
                  className="rl-file-content"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(bibleFileContent) }}
                />
              )}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="rl-footer">
          <span className="rl-footer-text">
            {tab === 'library'
              ? `${files.length} library files`
              : `${levels.length} Bible levels`}
          </span>
        </div>
      </div>
    </>
  );
}
