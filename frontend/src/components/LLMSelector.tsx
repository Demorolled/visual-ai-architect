import { useEffect, useState, useCallback } from 'react';
import { useLlmStore, LlmStatus, DSparkStatus, PROVIDERS } from '../store/llmStore';
import './LLMSelector.css';

export default function LLMSelector() {
  const {
    llmUrl,
    selectedModel,
    availableModels,
    connectionStatus,
    latency,
    isFetchingModels,
    isScanning,
    isProviderScanning,
    providerScanResults,
    lastScanTimestamp,
    autoConnectedProvider,
    dsparkStatus,
    dsparkBenchmark,
    fetchDsparkStatus,
    fetchDsparkBenchmark,
    fetchModels,
    scanOllama,
    scanAllProviders,
    selectModel,
    testConnection,
    setLlmUrl,
  } = useLlmStore();

  const [editingUrl, setEditingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState(llmUrl);
  const [scanResult, setScanResult] = useState<{ message: string; type: 'success' | 'error' | '' }>({ message: '', type: '' });

  // Fetch models on mount
  useEffect(() => {
    fetchModels();
  }, []);

  // Auto-scan all providers on mount
  useEffect(() => {
    scanAllProviders();
  }, []);

  // Poll DSpark server status — faster while loading (model boot ~30-60s), slow
  // otherwise. The tuned-vs-stock benchmark piggybacks on this interval so its
  // results appear automatically once the harness finishes writing the report
  // (the endpoint returns { exists: false } until then — cheap to poll).
  useEffect(() => {
    fetchDsparkStatus();
    fetchDsparkBenchmark();
    const interval = setInterval(() => {
      fetchDsparkStatus();
      fetchDsparkBenchmark();
    }, dsparkStatus.status === 'loading' ? 5000 : 30000);
    return () => clearInterval(interval);
  }, [dsparkStatus.status, fetchDsparkStatus, fetchDsparkBenchmark]);

  // Clear auto-connect notification after 6 seconds
  useEffect(() => {
    if (autoConnectedProvider) {
      const timer = setTimeout(() => {
        useLlmStore.setState({ autoConnectedProvider: null });
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [autoConnectedProvider]);

  useEffect(() => {
    // Auto-test when model changes
    if (selectedModel) {
      testConnection();
    }
  }, [selectedModel]);

  const handleRefresh = useCallback(() => {
    fetchModels();
  }, [fetchModels]);

  const handleScanOllama = useCallback(async () => {
    setScanResult({ message: 'Scanning Ollama...', type: '' });
    const result = await scanOllama();
    if (result.scanned) {
      setScanResult({ message: `✅ Found ${result.count} model(s)`, type: 'success' });
    } else {
      setScanResult({ message: `⚠️ ${result.error || 'Scan failed'}`, type: 'error' });
    }
    setTimeout(() => setScanResult({ message: '', type: '' }), 4000);
  }, [scanOllama]);

  const handleUrlSave = useCallback(() => {
    const trimmed = urlInput.trim();
    if (trimmed) {
      setLlmUrl(trimmed.replace(/\/v1\/?$/, '')); // strip /v1 suffix if user added it
    }
    setEditingUrl(false);
  }, [urlInput, setLlmUrl]);

  const statusColor = (status: LlmStatus) => {
    switch (status) {
      case 'connected': return '#4ade80';
      case 'testing': return '#f59e0b';
      case 'disconnected': return '#ef4444';
      default: return '#64748b';
    }
  };

  const statusLabel = (status: LlmStatus) => {
    switch (status) {
      case 'connected': return 'Connected';
      case 'testing': return 'Testing...';
      case 'disconnected': return 'Offline';
      default: return 'Idle';
    }
  };

  return (
    <div className="llm-selector">
      {/* ── Connection URL ── */}
      <div className="llm-selector-section">
        <div className="llm-selector-section-title">🔌 Server URL</div>
        {editingUrl ? (
          <div className="llm-url-edit">
            <input
              className="llm-url-input"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="http://127.0.0.1:11434"
              onKeyDown={(e) => { if (e.key === 'Enter') handleUrlSave(); if (e.key === 'Escape') setEditingUrl(false); }}
              autoFocus
            />
            <div className="llm-url-actions">
              <button className="llm-url-btn llm-url-btn-save" onClick={handleUrlSave}>Save</button>
              <button className="llm-url-btn llm-url-btn-cancel" onClick={() => { setUrlInput(llmUrl); setEditingUrl(false); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="llm-url-display" onClick={() => { setUrlInput(llmUrl); setEditingUrl(true); }} title="Click to edit">
            <span className="llm-url-text">{llmUrl}</span>
            <span className="llm-url-edit-icon">✏️</span>
          </div>
        )}
      </div>

      {/* ── Connection Status ── */}
      <div className="llm-selector-section">
        <div className="llm-selector-section-title">📊 Status</div>
        <div className="llm-status-row">
          <span
            className="llm-status-dot"
            style={{
              background: statusColor(connectionStatus),
              boxShadow: connectionStatus === 'connected' ? `0 0 6px ${statusColor(connectionStatus)}` : 'none',
              animation: connectionStatus === 'testing' ? 'pulse 1s ease-in-out infinite' : 'none',
            }}
          />
          <span className="llm-status-label">{statusLabel(connectionStatus)}</span>
          {latency !== null && (
            <span className="llm-status-latency">{latency}ms</span>
          )}
          <span className="llm-status-model-name">{selectedModel.split('/').pop()}</span>
        </div>
        <div className="llm-status-actions">
          <button
            className="llm-action-btn"
            onClick={testConnection}
            disabled={connectionStatus === 'testing'}
          >
            {connectionStatus === 'testing' ? '⏳ Testing...' : '🔌 Test'}
          </button>
          {connectionStatus === 'disconnected' && (
            <button
              className="llm-action-btn llm-reconnect-btn"
              onClick={testConnection}
            >
              🔄 Reconnect
            </button>
          )}
          <button
            className="llm-action-btn"
            onClick={handleRefresh}
            disabled={isFetchingModels}
          >
            {isFetchingModels ? '⏳' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* ── DSpark Server Status ── */}
      <div className="llm-selector-section">
        <div className="llm-selector-section-title">⚡ DSpark Server</div>
        <div className="llm-dspark-card">
          <div className="llm-dspark-header">
            <span
              className="llm-dspark-dot"
              style={{
                background: dsparkDotColor(dsparkStatus.status),
                boxShadow: dsparkStatus.status === 'running' ? '0 0 6px rgba(74,222,128,0.6)' : 'none',
                animation: dsparkStatus.status === 'loading' ? 'llm-pulse 0.9s ease-in-out infinite' : 'none',
              }}
            />
            <span className="llm-dspark-label">{dsparkLabel(dsparkStatus.status)}</span>
            {dsparkStatus.draftMode !== null && (
              <span className={`llm-dspark-draft draft-${dsparkStatus.draftMode}`} title={`Draft mode: ${dsparkStatus.draftMode}`}>
                draft: {dsparkStatus.draftMode}
              </span>
            )}
            <button
              className="llm-dspark-refresh"
              onClick={() => { fetchDsparkStatus(); fetchDsparkBenchmark(); }}
              title="Refresh DSpark status + benchmark"
            >
              🔄
            </button>
          </div>
          {dsparkStatus.status === 'running' && dsparkStatus.model && (
            <div className="llm-dspark-meta">
              <span className="llm-dspark-model">🧠 {dsparkStatus.model.split('/').pop()}</span>
              {dsparkStatus.latencyMs !== null && (
                <span className="llm-dspark-latency">⏱ {dsparkStatus.latencyMs}ms</span>
              )}
              <span className="llm-dspark-port">: {dsparkStatus.port}</span>
            </div>
          )}
          {dsparkStatus.status === 'running' && (
            <div className="llm-dspark-perf">
              <span className="llm-dspark-tps" title="Rolling throughput from the health endpoint">
                ⚡ {dsparkStatus.tokensPerSec !== null ? `${dsparkStatus.tokensPerSec.toFixed(1)} tok/s` : '— tok/s'}
              </span>
              {dsparkStatus.speculativeDecoding && (
                <span className="llm-dspark-accel" title="Speculative decoding is active">🚀 draft-accelerated</span>
              )}
              {dsparkStatus.totalRequests > 0 && (
                <span className="llm-dspark-total">
                  🧮 {formatTokenCount(dsparkStatus.totalCompletionTokens)} in {dsparkStatus.totalRequests} req
                  {dsparkStatus.avgLatencyMs !== null && ` · avg ${dsparkStatus.avgLatencyMs}ms`}
                </span>
              )}
            </div>
          )}
          {dsparkStatus.status !== 'running' && dsparkStatus.hint && (
            <div className="llm-dspark-hint">{dsparkStatus.hint}</div>
          )}

          {/* ── Tuned vs Stock Benchmark ── */}
          {dsparkBenchmark && (
            <div className="llm-dspark-bench">
              <div className="llm-dspark-bench-title">📊 Tuned vs Stock</div>
              {!dsparkBenchmark.exists ? (
                <div className="llm-dspark-bench-pending">
                  ⏳ Benchmark pending — runs automatically after the tuned GGUF deploys
                </div>
              ) : (
                <>
                  <div className="llm-dspark-bench-cols">
                    <div className="llm-bench-col">
                      <span className="llm-bench-col-label tuned">Tuned</span>
                      <span className="llm-bench-col-val">
                        {dsparkBenchmark.tunedTps !== null ? `${dsparkBenchmark.tunedTps.toFixed(1)} tok/s` : '—'}
                      </span>
                      {dsparkBenchmark.tunedServerTps !== null && (
                        <span className="llm-bench-col-sub">server {dsparkBenchmark.tunedServerTps.toFixed(1)}</span>
                      )}
                    </div>
                    <div className="llm-bench-col">
                      <span className="llm-bench-col-label stock">Stock</span>
                      <span className="llm-bench-col-val">
                        {dsparkBenchmark.stockTps !== null ? `${dsparkBenchmark.stockTps.toFixed(1)} tok/s` : '—'}
                      </span>
                      {dsparkBenchmark.stockServerTps !== null && (
                        <span className="llm-bench-col-sub">server {dsparkBenchmark.stockServerTps.toFixed(1)}</span>
                      )}
                    </div>
                    {dsparkBenchmark.tunedTps !== null && dsparkBenchmark.stockTps !== null && dsparkBenchmark.stockTps > 0 && (
                      <div className={`llm-bench-delta ${dsparkBenchmark.tunedTps >= dsparkBenchmark.stockTps ? 'good' : 'bad'}`}>
                        {dsparkBenchmark.tunedTps >= dsparkBenchmark.stockTps ? '▲' : '▼'}{" "}
                        {((dsparkBenchmark.tunedTps - dsparkBenchmark.stockTps) / dsparkBenchmark.stockTps * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>
                  {dsparkBenchmark.stockError && (
                    <div className="llm-dspark-bench-stockerr">⚠️ stock control: {dsparkBenchmark.stockError}</div>
                  )}
                  <div className={`llm-dspark-bench-draft ${dsparkBenchmark.draftOk ? 'ok' : dsparkBenchmark.draftOk === false ? 'fail' : ''}`}>
                    {dsparkBenchmark.draftOk === true && (
                      <>🚀 draft-mode OK{ dsparkBenchmark.draftMode ? ` (${dsparkBenchmark.draftMode})` : ''}{dsparkBenchmark.draftTps !== null ? ` · ${dsparkBenchmark.draftTps.toFixed(1)} tok/s` : ''}</>
                    )}
                    {dsparkBenchmark.draftOk === false && (
                      <>⚠️ draft-mode FAILED — speculative decoding broken with the tuned GGUF</>
                    )}
                    {dsparkBenchmark.draftOk === null && dsparkBenchmark.exists && (
                      <>· draft check pending</>
                    )}
                  </div>
                  {dsparkBenchmark.historicalStockTps !== null && (
                    <div className="llm-dspark-bench-hist">
                      pre-training stock baseline: {dsparkBenchmark.historicalStockTps.toFixed(1)} tok/s
                    </div>
                  )}
                  {dsparkBenchmark.finalModel && (
                    <div className="llm-dspark-bench-model">serving: {dsparkBenchmark.finalModel.split('/').pop()}</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Available Models ── */}
      <div className="llm-selector-section llm-selector-models-section">
        <div className="llm-selector-section-title">
          🤖 Models
          <span className="llm-model-count">{availableModels.length}</span>
        </div>

        {isFetchingModels && availableModels.length === 0 ? (
          <div className="llm-loading">Fetching models...</div>
        ) : availableModels.length === 0 ? (
          <div className="llm-empty">
            <span>No models found</span>
            <span className="llm-empty-hint">Check server URL or start Ollama</span>
          </div>
        ) : (
          <div className="llm-model-list">
            {availableModels.map((model) => {
              const isSelected = model.id === selectedModel;
              const shortName = model.id.split('/').pop() || model.id;
              return (
                <div
                  key={model.id}
                  className={`llm-model-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => selectModel(model.id)}
                >
                  <div className="llm-model-item-header">
                    <span className={`llm-model-radio ${isSelected ? 'checked' : ''}`}>
                      {isSelected ? '●' : '○'}
                    </span>
                    <span className="llm-model-name" title={model.id}>
                      {shortName}
                    </span>
                    {isSelected && (
                      <span className="llm-model-badge">Active</span>
                    )}
                  </div>
                  <div className="llm-model-meta">
                    <span className="llm-model-full">{model.id}</span>
                    {model.size && (
                      <span className="llm-model-size">
                        {(model.size / 1e9).toFixed(1)} GB
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quick Actions ── */}
      <div className="llm-selector-section">
        <div className="llm-selector-section-title">⚡ Quick Actions</div>
        <div className="llm-quick-actions">
          <button
            className="llm-action-btn llm-action-btn-primary"
            onClick={testConnection}
            disabled={connectionStatus === 'testing'}
          >
            {connectionStatus === 'connected'
              ? `✅ Connected (${latency}ms)`
              : connectionStatus === 'testing'
                ? '⏳ Testing...'
                : '🔌 Test Connection'}
          </button>
          <button
            className="llm-action-btn"
            onClick={handleScanOllama}
            disabled={isScanning}
            title="Run 'ollama list' via backend to scan all installed models"
          >
            {isScanning ? '⏳ Scanning...' : '🔍 Scan Ollama'}
          </button>
          <button
            className="llm-action-btn llm-action-btn-scan"
            onClick={scanAllProviders}
            disabled={isProviderScanning}
            title="Ping all known LLM providers to see which are running"
          >
            {isProviderScanning ? '⏳ Scanning Providers...' : '🔎 Scan All Providers'}
          </button>
          {scanResult.message && (
            <div
              style={{
                padding: '4px 8px',
                fontSize: 10,
                fontWeight: 600,
                background: scanResult.type === 'success' ? 'rgba(74,222,128,0.1)' : scanResult.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                border: `1px solid ${scanResult.type === 'success' ? '#4ade80' : scanResult.type === 'error' ? '#ef4444' : '#f59e0b'}`,
                color: scanResult.type === 'success' ? '#4ade80' : scanResult.type === 'error' ? '#ef4444' : '#f59e0b',
              }}
            >
              {scanResult.message}
            </div>
          )}
          {autoConnectedProvider && (
            <div className="llm-auto-connect-notice">
              🔗 Auto-connected to <strong>{autoConnectedProvider}</strong>
            </div>
          )}
        </div>
      </div>

      {/* ── Available Providers ── */}
      <div className="llm-selector-section llm-providers-section">
        <div className="llm-selector-section-title">
          🌐 Providers
          {lastScanTimestamp !== null && (
            <span className="llm-providers-timestamp" title={`Last scanned: ${new Date(lastScanTimestamp).toLocaleString()}`}>
              🕐 {formatScanTime(lastScanTimestamp)}
            </span>
          )}
          <span className="llm-providers-count">{PROVIDERS.length}</span>
        </div>

        {/* ── Scan Summary ── */}
        {lastScanTimestamp !== null && (() => {
          const results = Object.values(providerScanResults);
          const verified = results.filter(r => r.status === 'verified').length;
          const reachable = results.filter(r => r.status === 'reachable').length;
          const unreachable = results.filter(r => r.status === 'unreachable').length;
          const scanning = results.filter(r => r.status === 'scanning').length;
          const totalScanned = verified + reachable + unreachable;
          if (totalScanned === 0 && scanning === 0) return null;
          return (
            <div className="llm-scan-summary">
              {scanning > 0 ? (
                <span className="llm-scan-summary-item llm-scan-summary-scanning">⏳ Scanning ({scanning})</span>
              ) : (
                <>
                  <span className="llm-scan-summary-item llm-scan-summary-verified">{verified} verified</span>
                  <span className="llm-scan-summary-sep">·</span>
                  <span className="llm-scan-summary-item llm-scan-summary-online">{reachable} online</span>
                  <span className="llm-scan-summary-sep">·</span>
                  <span className="llm-scan-summary-item llm-scan-summary-offline">{unreachable} offline</span>
                </>
              )}
            </div>
          );
        })()}

        <div className="llm-providers-list">
          {PROVIDERS.map((provider) => {
            const isActive = llmUrl.includes(provider.matchUrl);
            const scan = providerScanResults[provider.id];
            const scanStatus = provider.needsConfig ? 'needs-config' : (scan?.status || 'idle');
            return (
              <div
                key={provider.id}
                className={`llm-provider-item ${isActive ? 'active' : ''} ${scanStatus !== 'idle' ? `scan-${scanStatus}` : ''}`}
                onClick={() => {
                  setLlmUrl(provider.baseUrl);
                }}
              >
                <div className="llm-provider-header">
                  <span className="llm-provider-icon">{provider.icon}</span>
                  <span className="llm-provider-name">{provider.name}</span>
                  {isActive && (
                    <span className="llm-provider-badge">Active</span>
                  )}
                  {scanStatus !== 'idle' && (
                    <span className={`llm-provider-scan-indicator scan-${scanStatus}`} title={scan?.error || ''} />
                  )}
                </div>
                <div className="llm-provider-url">{provider.baseUrl}</div>
                {provider.description && (
                  <div className="llm-provider-desc">{provider.description}</div>
                )}
                {provider.apiKeyHint && (
                  <div className="llm-provider-hint">
                    <span className="llm-provider-hint-label">🔑</span>
                    {provider.apiKeyHint}
                  </div>
                )}
                {scanStatus === 'verified' && scan && (
                  <>
                    <div className="llm-provider-scan-meta">
                      <span className="llm-provider-verified-label">✅ Verified</span>
                      <span className="llm-provider-latency">⏱ {scan.latencyMs}ms</span>
                    </div>
                    <div className="llm-provider-scan-meta">
                      <span className="llm-provider-model-tested">🧠 {scan.modelTested || 'unknown'}</span>
                      {scan.modelLatencyMs !== null && scan.modelLatencyMs !== undefined && (
                        <span className="llm-provider-model-latency">⏱ {scan.modelLatencyMs}ms</span>
                      )}
                    </div>
                  </>
                )}
                {scan && scan.latencyMs !== null && scanStatus === 'reachable' && (
                  <div className="llm-provider-scan-meta">
                    <span className="llm-provider-latency">⏱ {scan.latencyMs}ms</span>
                    {scan.modelTested && (
                      <span className="llm-provider-model-tested" style={{ marginLeft: 8 }}>🧠 {scan.modelTested}</span>
                    )}
                  </div>
                )}
                {scanStatus === 'unreachable' && scan?.error && (
                  <div className="llm-provider-scan-meta llm-provider-scan-error">
                    {scan.error}
                  </div>
                )}
                {scanStatus === 'scanning' && (
                  <div className="llm-provider-scan-meta llm-provider-scanning-text">
                    ⏳ Pinging...
                  </div>
                )}
                {scanStatus === 'needs-config' && (
                  <div className="llm-provider-scan-meta llm-provider-needs-config-text">
                    ⚙️ Needs configuration
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatTokenCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function dsparkDotColor(status: DSparkStatus): string {
  switch (status) {
    case 'running': return '#4ade80';
    case 'loading': return '#f59e0b';
    case 'offline': return '#ef4444';
    default: return '#64748b';
  }
}

function dsparkLabel(status: DSparkStatus): string {
  switch (status) {
    case 'running': return 'Running';
    case 'loading': return 'Loading model...';
    case 'offline': return 'Offline';
    default: return 'Checking...';
  }
}

function formatScanTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 10000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}
