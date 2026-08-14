import { useState, useEffect, useCallback } from 'react';

const TRAIT_INFO: Record<string, { icon: string; label: string; desc: string }> = {
  warmth: { icon: '🔥', label: 'Warmth', desc: 'Friendly warmth vs professional coolness' },
  sassiness: { icon: '😏', label: 'Sassiness', desc: 'Playful wit vs straightforwardness' },
  verbosity: { icon: '📝', label: 'Verbosity', desc: 'Detailed explanations vs concise answers' },
  technical_depth: { icon: '🔬', label: 'Technical Depth', desc: 'Deep tech details vs simple explanations' },
  creativity: { icon: '🎨', label: 'Creativity', desc: 'Creative innovation vs proven solutions' },
  empathy: { icon: '💜', label: 'Empathy', desc: 'Emotional attunement vs practical focus' },
  formality: { icon: '👔', label: 'Formality', desc: 'Formal language vs casual tone' },
  proactiveness: { icon: '⚡', label: 'Proactiveness', desc: 'Taking initiative vs responding to requests' },
  curiosity: { icon: '🔍', label: 'Curiosity', desc: 'Exploring possibilities vs staying focused' },
  patience: { icon: '🧘', label: 'Patience', desc: 'Patient explanations vs efficient directness' },
};

interface SoulSettingsProps {
  onClose: () => void;
}

export default function SoulSettings({ onClose }: SoulSettingsProps) {
  const [traits, setTraits] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  // Load traits from backend
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/soul');
        const data = await res.json();
        if (data.success && data.soul?.personality?.traits) {
          setTraits(data.soul.personality.traits);
        }
      } catch {
        // Use defaults
        setTraits({
          warmth: 25, sassiness: 60, verbosity: 32, technical_depth: 95,
          creativity: 73, empathy: 20, formality: 50, proactiveness: 60,
          curiosity: 90, patience: 40,
        });
      }
      setLoading(false);
    })();
  }, []);

  const handleSlider = useCallback((trait: string, value: number) => {
    setTraits(prev => ({ ...prev, [trait]: value }));
    setStatus('');
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/soul/traits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traits }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('✅ Soul saved — personality updated');
        if (data.changes && Object.keys(data.changes).length > 0) {
          setTimeout(() => setStatus(''), 3000);
        }
      } else {
        setStatus('❌ Save failed: ' + (data.error || 'Unknown error'));
      }
    } catch {
      setStatus('❌ Could not save — backend unavailable');
    }
    setSaving(false);
  }, [traits]);

  const handleReset = useCallback(async () => {
    if (!confirm('Reset soul to default personality?')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/soul/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.soul?.personality?.traits) {
        setTraits(data.soul.personality.traits);
        setStatus('✅ Reset to defaults');
        setTimeout(() => setStatus(''), 3000);
      }
    } catch {
      setStatus('❌ Reset failed');
    }
    setSaving(false);
  }, []);

  const traitEntries = Object.entries(TRAIT_INFO);

  // Compute average for visual
  const avgTrait = Object.values(traits).length > 0
    ? Math.round(Object.values(traits).reduce((a, b) => a + b, 0) / Object.values(traits).length)
    : 50;

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="settings-modal-header">
          <span>🧠 Soul Personality</span>
          <button className="settings-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="settings-modal-body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Loading soul config...</div>
          ) : (
            <>
              {/* Average bar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', marginBottom: 12,
                background: 'rgba(99,102,241,0.08)', borderRadius: 6,
                border: '1px solid rgba(99,102,241,0.2)',
              }}>
                <span style={{ fontSize: 11, color: '#818cf8', fontWeight: 600 }}>Overall</span>
                <div style={{
                  flex: 1, height: 6, background: '#2d2d4e', borderRadius: 3,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${avgTrait}%`, height: '100%',
                    background: avgTrait > 70 ? '#4ade80' : avgTrait > 40 ? '#f59e0b' : '#f87171',
                    borderRadius: 3, transition: 'width 0.3s ease',
                  }} />
                </div>
                <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 30, textAlign: 'right' }}>{avgTrait}/100</span>
              </div>

              {traitEntries.map(([trait, info]) => {
                const val = traits[trait] ?? 50;
                return (
                  <div key={trait} style={{ marginBottom: 10 }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginBottom: 2,
                    }}>
                      <label style={{ fontSize: 11, color: '#94a3b8', cursor: 'pointer' }} title={info.desc}>
                        <span style={{ marginRight: 4 }}>{info.icon}</span>
                        {info.label}
                      </label>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: val > 70 ? '#4ade80' : val > 40 ? '#f59e0b' : '#f87171',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {val}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={val}
                      onChange={(e) => handleSlider(trait, parseInt(e.target.value))}
                      style={{
                        width: '100%', height: 4, appearance: 'none', outline: 'none',
                        background: `linear-gradient(to right, 
                          ${val > 70 ? '#4ade80' : val > 40 ? '#f59e0b' : '#f87171'} ${val}%, 
                          #2d2d4e ${val}%)`,
                        borderRadius: 2, cursor: 'pointer',
                      }}
                    />
                    <div style={{ fontSize: 9, color: '#64748b', marginTop: 1 }}>{info.desc}</div>
                  </div>
                );
              })}
            </>
          )}

          {status && (
            <div style={{
              marginTop: 8, padding: '6px 10px', fontSize: 11, borderRadius: 4,
              background: status.startsWith('✅') ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
              border: `1px solid ${status.startsWith('✅') ? '#4ade80' : '#f87171'}`,
              color: status.startsWith('✅') ? '#4ade80' : '#f87171',
            }}>
              {status}
            </div>
          )}
        </div>
        <div className="settings-modal-footer">
          <button
            className="settings-test-btn"
            onClick={handleReset}
            disabled={saving}
            style={{ opacity: saving ? 0.5 : 1 }}
          >
            ↺ Reset
          </button>
          <button
            className="settings-save-btn"
            onClick={handleSave}
            disabled={saving}
            style={{ opacity: saving ? 0.5 : 1 }}
          >
            {saving ? '💾 Saving...' : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
