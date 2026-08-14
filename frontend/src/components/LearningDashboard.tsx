import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

/* ── Types ─────────────────────────────────────────────────────────── */

interface DashboardStats {
  patterns: {
    total: number;
    byLanguage: Record<string, number>;
    byNodeType: Record<string, number>;
    byTag: Record<string, number>;
    averageQuality: number;
  };
  neural: {
    loss: number | null;
    iterations: number;
    trainedChars: number;
  } | null;
}

interface MindSpaceStats {
  success: boolean;
  model: { name: string; parameters: number; type: string };
  training: {
    isRunning: boolean;
    totalEpochs: number;
    bestLoss: number | null;
    bestAccuracy: number | null;
    currentTier: string | null;
    currentTierIndex: number;
    totalTiers: number;
    completedTierCount: number;
    tierProgress: Array<{
      name: string;
      label: string;
      index: number;
      completed: boolean;
      current: boolean;
    }>;
    logProgress: {
      epoch: number;
      maxEpoch: number;
      step: number;
      maxStep: number;
      loss: number | null;
      accuracy: number | null;
    };
    recentLog: string[];
  };
  checkpoints: {
    total: number;
    latest: { step: number; loss: number | null; accuracy: number | null; timestamp: string | null; epoch: number };
    history: Array<{ step: number; loss: number; accuracy: number }>;
  };
  datasheets: { total: number; totalLines: number };
  gpuInfo?: Array<{ index: number; name: string; gpuUtil: string; memUsed: string; memTotal: string; temp: string }>;
  train13m?: {
    model: { name: string; parameters: number; type: string };
    training: MindSpaceStats['training'];
    checkpoints: MindSpaceStats['checkpoints'];
  };
  train350m?: {
    model: { name: string; parameters: number; type: string };
    training: MindSpaceStats['training'];
    checkpoints: MindSpaceStats['checkpoints'];
  };
}

interface LearningDashboardProps {
  onClose?: () => void;
}

const COLORS = {
  bg: '#0d0d1a',
  card: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  text: '#e0e0e0',
  muted: '#666',
  accent: '#667eea',
  accent2: '#764ba2',
  green: '#4ade80',
  yellow: '#facc15',
  red: '#ef4444',
  cyan: '#22d3ee',
};

/* ── Helper Components ────────────────────────────────────────────── */

const Badge: React.FC<{ label: string; color?: string; bg?: string }> = ({ label, color, bg }) => (
  <span style={{
    padding: '2px 8px',
    borderRadius: 2,
    background: bg || `${COLORS.accent}22`,
    color: color || COLORS.accent,
    fontSize: '0.72rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  }}>{label}</span>
);

const NumberCard: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div style={{
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    padding: '14px 16px',
    textAlign: 'center',
  }}>
    <div style={{ fontSize: '1.6rem', fontWeight: 700, color: color || COLORS.accent, marginBottom: 2 }}>{value}</div>
    <div style={{ fontSize: '0.72rem', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
  </div>
);

const MiniChart: React.FC<{
  data: Array<{ step: number; value: number }>;
  color: string;
  height?: number;
  min?: number;
  max?: number;
}> = ({ data, color, height = 60, min, max }) => {
  if (data.length < 2) {
    return <div style={{ height, color: COLORS.muted, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Not enough data</div>;
  }
  const values = data.map(d => d.value);
  const mn = min ?? Math.min(...values);
  const mx = max ?? Math.max(...values);
  const range = mx - mn || 1;
  const w = 100 / data.length;
  const points = data.map((d, i) => {
    const x = i * w;
    const y = ((d.value - mn) / range) * (1 - 0.1) * height;
    return `${x},${height - y - height * 0.05}`;
  }).join(' ');
  return (
    <svg width="100%" height={height} style={{ display: 'block' }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
      <text x="0" y={height - 2} fill={COLORS.muted} fontSize="9">{mn.toFixed(3)}</text>
      <text x="100%" y={height - 2} fill={COLORS.muted} fontSize="9" textAnchor="end">{mx.toFixed(3)}</text>
    </svg>
  );
};

/* ── Main Component ───────────────────────────────────────────────── */

const LearningDashboard: React.FC<LearningDashboardProps> = ({ onClose }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [mindspace, setMindspace] = useState<MindSpaceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [mindspaceLoading, setMindspaceLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<'overview' | 'patterns' | 'neural' | 'training'>('overview');
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [knowledgeRes, mindspaceRes] = await Promise.allSettled([
        axios.get('/api/knowledge/stats'),
        axios.get('/api/mindspace/stats'),
      ]);
      if (knowledgeRes.status === 'fulfilled') {
        setStats(knowledgeRes.value.data);
        setLoading(false);
      } else {
        console.error('Knowledge stats error:', knowledgeRes.reason);
        setError('Could not connect to learning system');
        setLoading(false);
      }
      if (mindspaceRes.status === 'fulfilled' && mindspaceRes.value.data?.success) {
        setMindspace(mindspaceRes.value.data);
        setMindspaceLoading(false);
      } else {
        setMindspaceLoading(false);
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Could not connect to learning system');
      setLoading(false);
      setMindspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000); // poll every 8s
    return () => clearInterval(interval);
  }, [fetchData]);

  // Auto-scroll log
  useEffect(() => {
    if (selectedSection === 'training' && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mindspace?.training.recentLog, selectedSection]);

  if (loading && mindspaceLoading) {
    return (
      <div style={{ padding: '20px', color: '#888', textAlign: 'center', background: COLORS.bg }}>
        <div style={{ fontSize: '1.2rem', marginBottom: 8 }}>🧠</div>
        Loading learning dashboard...
      </div>
    );
  }

  if (error && !stats && !mindspace) {
    return (
      <div style={{ padding: '20px', color: COLORS.red, textAlign: 'center', background: COLORS.bg }}>
        {error}
        <div style={{ marginTop: 12 }}>
          <button onClick={fetchData} style={{
            padding: '6px 16px', border: `1px solid ${COLORS.accent}`, background: 'transparent',
            color: COLORS.accent, cursor: 'pointer', fontSize: '0.8rem',
          }}>Retry</button>
        </div>
      </div>
    );
  }

  const totalPatterns = stats?.patterns.total ?? 0;
  const neuralStatus = stats?.neural ?? null;
  const ms = mindspace?.training;
  const ck = mindspace?.checkpoints;

  const understandingScore = neuralStatus?.loss != null
    ? Math.max(0, Math.min(100, ((Math.exp(Math.log(95)) - Math.exp(neuralStatus.loss / 64)) / Math.exp(Math.log(95))) * 100)).toFixed(1)
    : 'N/A';

  const trainingProgress = ms?.logProgress?.maxStep && ms?.logProgress?.maxStep > 0
    ? Math.round((ms.logProgress.step / ms.logProgress.maxStep) * 100)
    : 0;

  return (
    <div style={{
      background: COLORS.bg,
      padding: '20px',
      color: COLORS.text,
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '680px',
      width: 'calc(100vw - 40px)',
      maxHeight: '85vh',
      overflowY: 'auto',
      position: 'relative',
      border: `1px solid ${COLORS.border}`,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🧠 Learning Dashboard</span>
          {ms?.isRunning && (
            <span style={{ fontSize: '0.65rem', color: COLORS.green, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.green, boxShadow: `0 0 6px ${COLORS.green}`, animation: 'pulse 1s ease-in-out infinite' }} />
              Training
            </span>
          )}
        </h2>
        {onClose && (
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.08)', border: 'none', color: COLORS.muted,
            borderRadius: 2, padding: '4px 10px', cursor: 'pointer', fontSize: '1rem', fontWeight: 600,
          }}>✕</button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {(['overview', 'patterns', 'neural', 'training'] as const).map(section => (
          <button key={section}
            onClick={() => setSelectedSection(section)}
            style={{
              padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
              background: selectedSection === section ? COLORS.accent : 'rgba(255,255,255,0.06)',
              color: selectedSection === section ? '#fff' : COLORS.muted,
              transition: 'all 0.2s',
            }}>
            {section === 'overview' ? '📊 Overview' : section === 'patterns' ? '📐 Patterns' : section === 'neural' ? '🧬 Neural' : '🚀 Training'}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* OVERVIEW TAB                                                */}
      {/* ══════════════════════════════════════════════════════════ */}
      {selectedSection === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            <NumberCard label="Patterns Learned" value={totalPatterns.toString()} color={COLORS.accent} />
            <NumberCard label="Understanding" value={`${understandingScore}%`} color={COLORS.green} />
            <NumberCard label="Chars Trained" value={(neuralStatus?.trainedChars || 0).toLocaleString()} color={COLORS.yellow} />
            <NumberCard label="Iterations" value={(neuralStatus?.iterations || 0).toLocaleString()} color={COLORS.red} />
          </div>

          {/* MindSpace Training snapshot */}
          {ms && (
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, padding: '14px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>🤖 MindSpace 2 Training</span>
                {ms.isRunning
                  ? <Badge label="Running" color={COLORS.green} bg={`${COLORS.green}18`} />
                  : <Badge label="Idle" color={COLORS.muted} bg={`${COLORS.muted}18`} />}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.78rem' }}>
                <DetailRow label="Tier" value={ms.currentTier ? `${ms.currentTier} (${ms.completedTierCount}/${ms.totalTiers})` : '—'} />
                <DetailRow label="Epoch" value={ms.logProgress ? `${ms.logProgress.epoch}/${ms.logProgress.maxEpoch}` : '—'} />
                <DetailRow label="Loss" value={ms.logProgress?.loss?.toFixed(4) ?? '—'} />
                <DetailRow label="Accuracy" value={ms.logProgress?.accuracy != null ? `${ms.logProgress.accuracy.toFixed(1)}%` : '—'} />
              </div>
            </div>
          )}

          {/* Progress bar */}
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, padding: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.8rem' }}>
              <span>Neural Network Training</span>
              <span style={{ color: COLORS.green }}>Loss: {neuralStatus?.loss?.toFixed(2) || 'N/A'}</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (parseFloat(understandingScore as string) || 0))}%`,
                background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accent2})`,
                transition: 'width 1s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.65rem', color: COLORS.muted }}>
              <span>Understanding Score</span>
              <span>{understandingScore}%</span>
            </div>
          </div>

          <div style={{ background: `${COLORS.accent}12`, padding: '8px 12px', fontSize: '0.78rem', color: '#aab' }}>
            ⚡ Auto-training active — RNN learns after each project build
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PATTERNS TAB                                              */}
      {/* ══════════════════════════════════════════════════════════ */}
      {selectedSection === 'patterns' && stats && (
        <div>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#ccc' }}>By Language</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {Object.entries(stats.patterns.byLanguage).map(([lang, count]) => (
                <Badge key={lang} label={`${lang}: ${count}`} color="#8be" bg={`${COLORS.accent}22`} />
              ))}
            </div>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#ccc' }}>By Node Type</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {Object.entries(stats.patterns.byNodeType).map(([type, count]) => (
                <Badge key={type} label={`${type}: ${count}`} color="#fd3" bg={`${COLORS.yellow}18`} />
              ))}
            </div>
          </div>
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#ccc' }}>Top Tags</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {Object.entries(stats.patterns.byTag)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 15)
                .map(([tag, count]) => (
                  <Badge key={tag} label={`${tag}: ${count}`} color="#8ec" bg={`${COLORS.green}15`} />
                ))}
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <a href="/api/knowledge" target="_blank" rel="noopener noreferrer" style={{
              padding: '6px 14px', background: `${COLORS.accent}22`, color: '#8be',
              textDecoration: 'none', fontSize: '0.78rem', fontWeight: 600,
            }}>View All Patterns</a>
            <a href="/api/neural" target="_blank" rel="noopener noreferrer" style={{
              padding: '6px 14px', background: `${COLORS.green}15`, color: '#8ec',
              textDecoration: 'none', fontSize: '0.78rem', fontWeight: 600,
            }}>Neural Model Status</a>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* NEURAL TAB                                               */}
      {/* ══════════════════════════════════════════════════════════ */}
      {selectedSection === 'neural' && (
        <div>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, padding: '14px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#ccc' }}>Model Status</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.82rem' }}>
              <DetailRow label="Initialized" value={neuralStatus ? 'Yes' : 'No'} />
              <DetailRow label="Loss" value={neuralStatus?.loss?.toFixed(4) || 'N/A'} />
              <DetailRow label="Iterations" value={neuralStatus?.iterations?.toLocaleString() || '0'} />
              <DetailRow label="Characters Trained" value={neuralStatus?.trainedChars?.toLocaleString() || '0'} />
            </div>
          </div>
          {/* MindSpace model info */}
          {mindspace && (
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, padding: '14px', marginTop: 10 }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#ccc' }}>MindSpace 2</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.8rem' }}>
                <DetailRow label="Type" value={mindspace.model.type} />
                <DetailRow label="Parameters" value={(mindspace.model.parameters / 1e6).toFixed(1) + 'M'} />
                <DetailRow label="Datasheets" value={mindspace.datasheets.total.toString()} />
                <DetailRow label="Total Lines" value={mindspace.datasheets.totalLines.toLocaleString()} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* TRAINING TAB (MindSpace)                                  */}
      {/* ══════════════════════════════════════════════════════════ */}
      {selectedSection === 'training' && (
        <div>
          {/* ── GPU Status Bar ── */}
          {mindspace?.gpuInfo && mindspace.gpuInfo.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: `repeat(${mindspace.gpuInfo.length}, 1fr)`,
              gap: '10px', marginBottom: '14px'
            }}>
              {mindspace.gpuInfo.map(gpu => (
                <div key={gpu.index} style={{
                  background: COLORS.card, border: `1px solid ${COLORS.border}`, padding: '10px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.6rem', color: COLORS.muted, marginBottom: 4 }}>
                    GPU {gpu.index} — {gpu.name.split(' ').slice(0,2).join(' ')}
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: COLORS.cyan }}>
                    {gpu.gpuUtil}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: COLORS.muted }}>
                    {gpu.memUsed} / {gpu.memTotal} · {gpu.temp}°C
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Dual Training Panels ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            {/* 13M Panel */}
            {renderTrainingPanel(mindspace?.train13m, '13M', '#4a9eff')}
            {/* 350M Panel */}
            {renderTrainingPanel(mindspace?.train350m, '350M', '#a855f7')}
          </div>

          {/* ── MindSpace 2 legacy panel (collapsed) ── */}
          <details style={{ marginBottom: '12px' }}>
            <summary style={{
              fontSize: '0.78rem', fontWeight: 600, color: COLORS.muted, cursor: 'pointer',
              padding: '8px 12px', background: COLORS.card, border: `1px solid ${COLORS.border}`,
            }}>
              ⚙️ Legacy: MindSpace 2 (original training)
            </summary>
            <div style={{ padding: '12px', background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: 'none' }}>
              {/* ── Status bar ── */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <NumberCard label="Completed Tiers" value={ms ? `${ms.completedTierCount}/${ms.totalTiers}` : '—'} color={COLORS.accent} />
                <NumberCard label="Best Loss" value={ms?.bestLoss?.toFixed(4) ?? '—'} color={COLORS.cyan} />
                <NumberCard label="Best Accuracy" value={ms?.bestAccuracy != null ? `${ms.bestAccuracy.toFixed(1)}%` : '—'} color={COLORS.green} />
                <NumberCard label="Checkpoints" value={(ck?.total ?? 0).toString()} color={COLORS.yellow} />
              </div>

              {/* ── Live Metrics ── */}
              {ms?.logProgress && (
                <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, padding: '14px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {ms.currentTier || 'Training'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: COLORS.muted }}>
                      Epoch {ms.logProgress.epoch}/{ms.logProgress.maxEpoch}
                    </span>
                  </div>
                  {ms.logProgress.maxStep > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: COLORS.muted, marginBottom: 3 }}>
                        <span>Step {ms.logProgress.step.toLocaleString()}</span>
                        <span>{trainingProgress}%</span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${trainingProgress}%`, background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.cyan})`, transition: 'width 2s ease' }} />
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.82rem' }}>
                    <DetailRow label="Loss" value={ms.logProgress.loss?.toFixed(4) ?? '—'} />
                    <DetailRow label="Accuracy" value={ms.logProgress.accuracy != null ? `${ms.logProgress.accuracy.toFixed(2)}%` : '—'} />
                    <DetailRow label="Step" value={ms.logProgress.step.toLocaleString()} />
                    <DetailRow label="Checkpoints Saved" value={(ck?.total ?? 0).toString()} />
                  </div>
                </div>
              )}

              {/* ── Tier Progress ── */}
              {ms && (
                <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, padding: '14px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Tier Progression</div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: 8 }}>
                    {ms.tierProgress.map(tier => (
                      <div key={tier.name} style={{
                        flex: '1 0 auto', minWidth: '36px', textAlign: 'center', padding: '6px 0', fontSize: '0.65rem', fontWeight: 600,
                        background: tier.completed ? `${COLORS.green}22` : tier.current ? `${COLORS.accent}33` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${tier.completed ? COLORS.green : tier.current ? COLORS.accent : COLORS.border}`,
                        color: tier.completed ? COLORS.green : tier.current ? COLORS.accent : COLORS.muted,
                      }}>
                        <div style={{ marginBottom: 2 }}>{tier.completed ? '✓' : tier.current ? '▶' : '○'}</div>
                        <div>{tier.label.split(' ')[0]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Loss / Accuracy Chart ── */}
              {ck?.history && ck.history.length >= 2 && (
                <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, padding: '14px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Loss Trend</div>
                  <MiniChart data={ck.history.map(h => ({ step: h.step, value: h.loss }))} color={COLORS.cyan} height={50} />
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: 10, marginBottom: 4 }}>Accuracy Trend</div>
                  <MiniChart data={ck.history.map(h => ({ step: h.step, value: h.accuracy }))} color={COLORS.green} height={50} min={85} max={100} />
                </div>
              )}

              {/* ── Training Log ── */}
              {ms?.recentLog && ms.recentLog.length > 0 && (
                <div style={{ background: '#0a0a14', border: `1px solid ${COLORS.border}`, padding: '10px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: COLORS.cyan, marginBottom: 6 }}>═══ Training Log ═══</div>
                  <div style={{
                    fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace', fontSize: '0.65rem', lineHeight: '1.5',
                    color: '#8a8aaa', maxHeight: '180px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  }}>
                    {ms.recentLog.map((line, i) => (
                      <div key={i} style={{
                        color: line.includes('✅') || line.includes('complete') ? COLORS.green :
                               line.includes('❌') || line.includes('error') ? COLORS.red :
                               line.includes('TIER') ? COLORS.accent :
                               line.includes('Epoch') ? '#aac' :
                               line.includes('Accuracy') || line.includes('Loss') ? '#aae' : '#8a8aaa',
                      }}>{line}</div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                </div>
              )}

              {/* ── Datasheet info ── */}
              {mindspace?.datasheets && (
                <div style={{ background: `${COLORS.accent}10`, padding: '8px 12px', fontSize: '0.72rem', color: '#aab' }}>
                  📚 {mindspace.datasheets.total} datasheets ({mindspace.datasheets.totalLines.toLocaleString()} total lines) — {ms?.isRunning ? 'Training active' : 'Training paused'}
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
    <span style={{ color: COLORS.muted }}>{label}</span>
    <span style={{ color: '#ddd', fontWeight: 600 }}>{value}</span>
  </div>
);

/**
 * Render a training panel card for 13M / 350M
 */
function renderTrainingPanel(data: any, label: string, accentColor: string) {
  if (!data) {
    return (
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, padding: '14px' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: accentColor, marginBottom: 8 }}>
          🧠 MindSpace {label}
        </div>
        <div style={{ fontSize: '0.75rem', color: COLORS.muted }}>No data available</div>
      </div>
    );
  }
  const t = data.training;
  const ck = data.checkpoints;
  const isRunning = t?.isRunning;
  const tierProgress = t?.logProgress?.maxStep > 0
    ? Math.round((t.logProgress.step / t.logProgress.maxStep) * 100)
    : 0;

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${isRunning ? accentColor + '66' : COLORS.border}`, padding: '14px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: accentColor }}>
          🧠 MindSpace {label}
        </span>
        {isRunning !== undefined && (
          <span style={{
            fontSize: '0.6rem', fontWeight: 600,
            color: isRunning ? COLORS.green : COLORS.muted,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isRunning ? COLORS.green : COLORS.muted,
              boxShadow: isRunning ? `0 0 6px ${COLORS.green}` : 'none',
              animation: isRunning ? 'pulse 1s ease-in-out infinite' : 'none',
            }} />
            {isRunning ? 'Training' : 'Idle'}
          </span>
        )}
      </div>

      {/* Model info */}
      <div style={{ fontSize: '0.65rem', color: COLORS.muted, marginBottom: 8 }}>
        {data.model.name} · {(data.model.parameters / 1e6).toFixed(0)}M params
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '0.75rem', marginBottom: 8 }}>
        <DetailRow label="Tier" value={t?.currentTier ? `${t.currentTier} (${t.completedTierCount}/${t.totalTiers})` : '—'} />
        <DetailRow label="Epoch" value={t?.logProgress ? `${t.logProgress.epoch}/${t.logProgress.maxEpoch}` : '—'} />
        <DetailRow label="Loss" value={t?.logProgress?.loss?.toFixed(4) ?? t?.bestLoss?.toFixed(4) ?? '—'} />
        <DetailRow label="Accuracy" value={t?.logProgress?.accuracy != null ? `${t.logProgress.accuracy.toFixed(1)}%` : t?.bestAccuracy != null ? `${t.bestAccuracy.toFixed(1)}%` : '—'} />
      </div>

      {/* Step progress bar */}
      {t?.logProgress?.maxStep > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: COLORS.muted, marginBottom: 2 }}>
            <span>Step {t.logProgress.step.toLocaleString()}</span>
            <span>{tierProgress}%</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${tierProgress}%`,
              background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)`,
              transition: 'width 2s ease',
            }} />
          </div>
        </div>
      )}

      {/* Latest checkpoint */}
      {ck?.latest?.step > 0 && (
        <div style={{ fontSize: '0.65rem', color: COLORS.muted, marginTop: 4 }}>
          Latest: step {ck.latest.step.toLocaleString()} · loss: {ck.latest.loss?.toFixed(4) ?? '—'} · acc: {ck.latest.accuracy?.toFixed(1) ?? '—'}%
        </div>
      )}

      {/* Tier progress pills */}
      {t?.tierProgress && (
        <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', marginTop: 6 }}>
          {t.tierProgress.map((tier: any) => (
            <div key={tier.name} style={{
              width: 14, height: 14, fontSize: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: tier.completed ? `${COLORS.green}33` : tier.current ? `${accentColor}44` : 'rgba(255,255,255,0.05)',
              border: `1px solid ${tier.completed ? COLORS.green : tier.current ? accentColor : COLORS.border}`,
            }} title={tier.label}>
              {tier.completed ? '✓' : tier.current ? '●' : '·'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default LearningDashboard;
