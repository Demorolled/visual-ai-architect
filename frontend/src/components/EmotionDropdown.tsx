import { useState, useEffect, useRef } from 'react';
import { EmotionResult, EMOTION_COLORS, EMOTION_ICONS, getUserStateLabel } from '../utils/emotionEngine';
import { getPersonality, setPersonality, DIMENSION_META, PersonalityConfig } from '../utils/emotionConfig';
import VeronicaPrism from './VeronicaPrism';
import './EmotionDropdown.css';

interface Props {
  lastEmotion: EmotionResult;
}

export default function EmotionDropdown({ lastEmotion }: Props) {
  const [open, setOpen] = useState(false);
  const [personality, setPersonalityState] = useState<PersonalityConfig>(() => getPersonality());
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setPersonalityState(getPersonality());
    window.addEventListener('vaia:personality-change', handler);
    return () => window.removeEventListener('vaia:personality-change', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  const dominantColor = EMOTION_COLORS[lastEmotion.dominant] || '#6b7280';

  const handlePersonality = (dimension: keyof PersonalityConfig, val: number) => {
    setPersonality(dimension, val);
    const next = { ...personality, [dimension]: val };
    setPersonalityState(next);
    window.dispatchEvent(new CustomEvent('vaia:personality-change', { detail: next }));
    // P1: also persist to the soul (single source of truth) so the backend
    // personality the chat syncs from matches these sliders — otherwise the
    // next syncPersonalityFromSoul() would overwrite the user's adjustment.
    const mapToSoul: Record<keyof PersonalityConfig, string> = {
      sassiness: 'sassiness',
      warmth: 'warmth',
      verbosity: 'verbosity',
      technical: 'technical_depth',
      creativity: 'creativity',
    };
    const trait = mapToSoul[dimension];
    void fetch('/api/soul/traits', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ traits: { [trait]: val } }),
    }).catch(() => {});
  };

  const topEmotions = Object.entries(lastEmotion.probabilities)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="emotion-dropdown" ref={dropdownRef}>
      <button
        className={`emotion-dropdown-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
        title={open ? 'Close' : 'Emotion & personality'}
        style={{
          borderColor: open ? dominantColor : dominantColor + '66',
          background: open ? dominantColor + '22' : dominantColor + '11',
          color: dominantColor,
        }}
      >
        <span>{EMOTION_ICONS[lastEmotion.dominant]} {getUserStateLabel(lastEmotion)}</span>
        <span className="emotion-dropdown-arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="emotion-dropdown-panel">
          <div className="emotion-dd-header">
            <span>User Emotion</span>
            <span className="emotion-dd-confidence" style={{ color: dominantColor }}>
              {EMOTION_ICONS[lastEmotion.dominant]} {getUserStateLabel(lastEmotion)} — {(lastEmotion.confidence * 100).toFixed(0)}%
            </span>
          </div>

          <div className="emotion-dd-bars">
            {topEmotions.map(([emotion, prob]) => {
              const pct = Math.round(prob * 100);
              const color = EMOTION_COLORS[emotion as keyof typeof EMOTION_COLORS] || '#666';
              return (
                <div key={emotion} className="emotion-dd-bar-row">
                  <span className="emotion-dd-bar-icon">
                    {EMOTION_ICONS[emotion as keyof typeof EMOTION_ICONS] || ''}
                  </span>
                  <span className="emotion-dd-bar-label">{emotion}</span>
                  <div className="emotion-dd-bar-track">
                    <div className="emotion-dd-bar-fill" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span className="emotion-dd-bar-value" style={{ color: prob > 0.3 ? color : '#666', fontWeight: prob > 0.3 ? 600 : 400 }}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>

          <div className="emotion-dd-vad">
            <span>🌡 Valence: {(lastEmotion.valence * 100).toFixed(0)}%</span>
            <span>⚡ Arousal: {(lastEmotion.arousal * 100).toFixed(0)}%</span>
            <span>👑 Dominance: {(lastEmotion.dominance * 100).toFixed(0)}%</span>
          </div>

          <div className="emotion-dd-divider" />

          <div className="emotion-dd-personality">
            <div className="emotion-dd-personality-title">
              <VeronicaPrism width={16} height={19} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {' '}Veronica Personality
            </div>
            {(Object.keys(DIMENSION_META) as (keyof PersonalityConfig)[]).map((dim) => {
              const meta = DIMENSION_META[dim];
              const val = personality[dim];
              return (
                <div key={dim} className="emotion-dd-dim-row">
                  <div className="emotion-dd-dim-header">
                    <span><span className="emotion-dd-dim-icon">{meta.icon}</span> {meta.label}: <strong>{val}%</strong></span>
                    <span className="emotion-dd-dim-tag" style={{
                      opacity: val > 60 ? 1 : 0.5,
                    }}>
                      {val <= 30 ? meta.lowLabel : val >= 70 ? meta.highLabel : val <= 45 ? `Low ${meta.highLabel}` : `Moderate`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={val}
                    onChange={(e) => handlePersonality(dim, parseInt(e.target.value, 10))}
                    className="emotion-dd-slider"
                  />
                  <div className="emotion-dd-slider-labels">
                    <span>{meta.lowLabel}</span>
                    <span>{meta.highLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
