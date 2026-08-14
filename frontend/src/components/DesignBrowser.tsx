import { useState, useEffect, useCallback } from 'react';
import { StoredDesign, OpenSourceRepo } from '../types';

interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

interface AltProject {
  name: string;
  description: string;
  category: string;
  stars: number;
  url: string;
  license?: string;
  languages?: string[];
  alternativesTo?: string[];
}

interface DesignBrowserProps {
  goal: string;
  purpose: string;
  onSelectDesign: (design: StoredDesign) => void;
  onImportRepo: (repo: OpenSourceRepo) => void;
  importing: boolean;
  importStatus: string;
}

export default function DesignBrowser({ goal, purpose, onSelectDesign, onImportRepo, importing, importStatus }: DesignBrowserProps) {
  const [localDesigns, setLocalDesigns] = useState<StoredDesign[]>([]);
  const [ossResults, setOssResults] = useState<OpenSourceRepo[]>([]);
  const [webResults, setWebResults] = useState<WebSearchResult[]>([]);
  const [altResults, setAltResults] = useState<AltProject[]>([]);
  const [searchingLocal, setSearchingLocal] = useState(true);
  const [searchingOSS, setSearchingOSS] = useState(false);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [searchingAlt, setSearchingAlt] = useState(false);
  const [ossError, setOssError] = useState('');
  const [webError, setWebError] = useState('');
  const [altError, setAltError] = useState('');

  const searchAll = useCallback(async () => {
    const q = goal || purpose || 'application';

    // Kick off all 4 searches in parallel from the start
    setSearchingLocal(true);
    setSearchingOSS(true);
    setSearchingWeb(true);
    setSearchingAlt(true);
    setOssError('');
    setWebError('');
    setAltError('');

    await Promise.allSettled([
      // Search 1: Local designs
      (async () => {
        try {
          const res = await fetch(`/api/designs/search?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          setLocalDesigns(data.designs || []);
        } catch {
          setLocalDesigns([]);
        }
        setSearchingLocal(false);
      })(),

      // Search 2: GitHub open source
      (async () => {
        try {
          const res = await fetch(`/api/designs/search-open-source?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          if (data.success) {
            setOssResults(data.repos || []);
          } else {
            setOssError(data.error || 'Search failed');
            setOssResults([]);
          }
        } catch {
          setOssError('Could not reach GitHub API');
          setOssResults([]);
        }
        setSearchingOSS(false);
      })(),

      // Search 3: Web search
      (async () => {
        try {
          const res = await fetch('/api/design-research/web', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, maxResults: 5 }),
            signal: AbortSignal.timeout(15000),
          });
          const data = await res.json();
          if (data.success) {
            setWebResults(data.results || []);
          } else {
            setWebError(data.error || 'Web search failed');
            setWebResults([]);
          }
        } catch {
          setWebError('Could not reach web search');
          setWebResults([]);
        }
        setSearchingWeb(false);
      })(),

      // Search 4: OpenSourceAlternative.to
      (async () => {
        try {
          const res = await fetch('/api/design-research/alt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, maxResults: 6 }),
            signal: AbortSignal.timeout(15000),
          });
          const data = await res.json();
          if (data.success) {
            setAltResults(data.projects || []);
          } else {
            setAltError(data.error || 'Open source alternatives search failed');
            setAltResults([]);
          }
        } catch {
          setAltError('Could not reach OpenSourceAlternative.to');
          setAltResults([]);
        }
        setSearchingAlt(false);
      })(),
    ]);
  }, [goal, purpose]);

  useEffect(() => {
    searchAll();
  }, [searchAll]);

  const handleOpenSourceImport = async (repo: OpenSourceRepo) => {
    await onImportRepo(repo);
  };

  const isSearching = searchingLocal || searchingOSS || searchingWeb || searchingAlt;
  const totalResults = localDesigns.length + ossResults.length + webResults.length + altResults.length;

  return (
    <div className="design-browser">
      <div className="db-header">
        <h2>🔍 Design Search Results</h2>
        <span className="db-subtitle">
          Found {totalResults} results across {[
            localDesigns.length > 0 ? `${localDesigns.length} local` : '',
            ossResults.length > 0 ? `${ossResults.length} GitHub` : '',
            webResults.length > 0 ? `${webResults.length} web` : '',
            altResults.length > 0 ? `${altResults.length} alternatives` : '',
          ].filter(Boolean).join(', ') || 'all sources'}
        </span>
        <button className="db-refresh" onClick={searchAll} disabled={isSearching}>
          🔄 Refresh
        </button>
      </div>

      {/* Section 1: Local Designs */}
      {searchingLocal && <div className="db-loading">Searching local designs...</div>}
      {!searchingLocal && (
        <div className="db-section">
          <h3>📂 Local Design Library</h3>
          {localDesigns.length === 0 ? (
            <div className="db-empty">No matching local designs found.</div>
          ) : (
            <div className="db-grid">
              {localDesigns.map(design => (
                <div key={design.id} className="db-card" onClick={() => onSelectDesign(design)}>
                  <div className="db-card-header">
                    <span className="db-card-name">{design.name}</span>
                    <span className="db-card-badge">{design.source}</span>
                  </div>
                  <div className="db-card-goal">{design.goal.substring(0, 100)}</div>
                  <div className="db-card-meta">
                    <span>📦 {design.nodes.length} nodes</span>
                    <span>🔗 {design.edges.length} connections</span>
                  </div>
                  {design.tags.length > 0 && (
                    <div className="db-card-tags">
                      {design.tags.slice(0, 4).map(t => <span key={t} className="db-tag">{t}</span>)}
                    </div>
                  )}
                  <div className="db-card-date">{new Date(design.createdAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="db-divider" />

      {/* Section 2: GitHub Open Source */}
      <div className="db-section">
        <h3>🐙 Open-Source Matches (GitHub)</h3>
        {searchingOSS && <div className="db-loading">Searching GitHub for matching projects...</div>}
        {ossError && <div className="db-error">{ossError}</div>}
        {importing && (
          <div className="db-importing">
            <span>⏳ Analyzing repository and building design...</span>
            {importStatus && <span className="db-import-status">{importStatus}</span>}
          </div>
        )}
        {!searchingOSS && !ossError && ossResults.length === 0 && (
          <div className="db-empty">No open-source matches found on GitHub.</div>
        )}
        {!searchingOSS && ossResults.length > 0 && (
          <div className="db-grid">
            {ossResults.map(repo => (
              <div key={repo.id} className="db-card db-oss-card">
                <div className="db-card-header">
                  <span className="db-card-name">{repo.name}</span>
                  <span className="db-card-stars">⭐ {repo.stars}</span>
                </div>
                <div className="db-card-fullname">{repo.full_name}</div>
                <div className="db-card-goal">{repo.description?.substring(0, 120) || 'No description'}</div>
                <div className="db-card-meta">
                  <span>🔤 {repo.language || 'N/A'}</span>
                  <span>📜 {repo.license}</span>
                </div>
                {repo.topics && repo.topics.length > 0 && (
                  <div className="db-card-tags">
                    {repo.topics.slice(0, 5).map(t => <span key={t} className="db-tag">{t}</span>)}
                  </div>
                )}
                <div className="db-card-actions">
                  <a href={repo.url} target="_blank" rel="noopener noreferrer" className="db-action-link" onClick={e => e.stopPropagation()}>
                    🔗 View
                  </a>
                  <button
                    className="db-action-import"
                    onClick={(e) => { e.stopPropagation(); handleOpenSourceImport(repo); }}
                    disabled={importing}
                  >
                    {importing ? '⏳...' : '📥 Import'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="db-divider" />

      {/* Section 3: Web Search Results */}
      <div className="db-section">
        <h3>🌐 Internet Search Results</h3>
        {searchingWeb && <div className="db-loading">Searching the web for similar apps...</div>}
        {webError && <div className="db-error">{webError}</div>}
        {!searchingWeb && !webError && webResults.length === 0 && (
          <div className="db-empty">No web search results found.</div>
        )}
        {!searchingWeb && webResults.length > 0 && (
          <div className="db-grid">
            {webResults.map((result, i) => (
              <div key={i} className="db-card db-web-card">
                <div className="db-card-header">
                  <span className="db-card-name">{result.title}</span>
                </div>
                <div className="db-card-goal">{result.content?.substring(0, 200) || 'No summary available'}</div>
                <div className="db-card-actions" style={{ marginTop: 8 }}>
                  <a href={result.url} target="_blank" rel="noopener noreferrer" className="db-action-link" onClick={e => e.stopPropagation()}>
                    🔗 Read More
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="db-divider" />

      {/* Section 4: OpenSourceAlternative.to */}
      <div className="db-section">
        <h3>📦 Open Source Alternatives</h3>
        {searchingAlt && <div className="db-loading">Searching OpenSourceAlternative.to for matching projects...</div>}
        {altError && <div className="db-error">{altError}</div>}
        {!searchingAlt && !altError && altResults.length === 0 && (
          <div className="db-empty">No matching projects found on OpenSourceAlternative.to.</div>
        )}
        {!searchingAlt && altResults.length > 0 && (
          <div className="db-grid">
            {altResults.map((proj, i) => (
              <div key={i} className="db-card db-alt-card">
                <div className="db-card-header">
                  <span className="db-card-name">{proj.name}</span>
                  <span className="db-card-stars">⭐ {proj.stars?.toLocaleString() || 'N/A'}</span>
                </div>
                <div className="db-card-category">{proj.category}</div>
                <div className="db-card-goal">{proj.description?.substring(0, 120) || 'No description'}</div>
                <div className="db-card-meta">
                  {proj.license && <span>📜 {proj.license}</span>}
                  {proj.languages && proj.languages.length > 0 && (
                    <span>🔤 {proj.languages.slice(0, 3).join(', ')}</span>
                  )}
                </div>
                {proj.alternativesTo && proj.alternativesTo.length > 0 && (
                  <div className="db-card-tags">
                    <span style={{ fontSize: 10, color: '#64748b', marginRight: 4 }}>Alternative to:</span>
                    {proj.alternativesTo.slice(0, 3).map(alt => (
                      <span key={alt} className="db-tag">{alt}</span>
                    ))}
                  </div>
                )}
                <div className="db-card-actions" style={{ marginTop: 8 }}>
                  <a href={proj.url} target="_blank" rel="noopener noreferrer" className="db-action-link" onClick={e => e.stopPropagation()}>
                    🔗 View Project
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
