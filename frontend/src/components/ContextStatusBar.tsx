/**
 * ContextStatusBar.tsx
 * ====================
 *
 * A slim, persistent status bar that shows the current shared context values
 * from the Shared State Store.
 *
 * Appears below the header / workflow bar and shows live-updating context
 * keys like theme, active project, goal, and any /set values from the terminal.
 *
 * Uses the useSharedContext hook to poll and listen for BroadcastChannel updates.
 */

import { useState, useEffect } from 'react';
import { useSharedContext } from '../hooks/useSharedContext';
import { subscribeSystemUpdates, type SystemState } from '../utils/systemAwareness';
import './ContextStatusBar.css';

/** Keys that get special display treatment */
const SPECIAL_KEYS = ['theme', 'projectName', 'goal', 'purpose'];

/** Emoji/icons for special keys */
const KEY_ICONS: Record<string, string> = {
  theme: '🎨',
  projectName: '📁',
  goal: '🎯',
  purpose: '💡',
};

/** Allowed icon for unknown keys */
const DEFAULT_ICON = '🔑';

export default function ContextStatusBar() {
  const { context, loading } = useSharedContext(5000); // Poll every 5s (less aggressive)

  // ── Live system state from System Awareness Daemon ──
  const [systemState, setSystemState] = useState<SystemState | null>(null);

  useEffect(() => {
    return subscribeSystemUpdates((state) => {
      setSystemState(state);
    });
  }, []);

  /** Safely convert any value to display string */
  const displayValue = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      try { return JSON.stringify(val); } catch { return String(val); }
    }
    return String(val).trim();
  };

  // Extract special keys that get prominent display
  const specialItems = SPECIAL_KEYS
    .filter((key) => displayValue(context[key]))
    .map((key) => ({
      key,
      icon: KEY_ICONS[key] || DEFAULT_ICON,
      value: displayValue(context[key]),
    }));

  // Other keys (non-special, non-empty)
  const otherKeys = Object.keys(context)
    .filter((key) => !SPECIAL_KEYS.includes(key))
    .filter((key) => displayValue(context[key]))
    .slice(0, 4); // Show at most 4 extra keys

  const totalKeys = Object.keys(context).length;

  // Don't render anything if there's no context data at all
  if (!loading && specialItems.length === 0 && otherKeys.length === 0) {
    return null;
  }

  return (
    <div className="context-status-bar">
      {/* Left: Loading indicator */}
      {loading && (
        <span className="csb-loading" title="Loading shared context...">
          <span className="csb-spinner" /> Context...
        </span>
      )}

      {/* Special keys (prominent display) */}
      {specialItems.map((item) => (
        <span key={item.key} className="csb-item csb-special" title={`${item.key}: ${item.value}`}>
          <span className="csb-icon">{item.icon}</span>
          <span className="csb-value">{item.value}</span>
        </span>
      ))}

      {/* Divider between special and other keys */}
      {specialItems.length > 0 && otherKeys.length > 0 && (
        <span className="csb-divider" />
      )}

      {/* Other keys (compact display) */}
      {otherKeys.map((key) => {
        const val = displayValue(context[key]);
        const displayVal = val.length > 20 ? val.substring(0, 18) + '…' : val;
        return (
          <span key={key} className="csb-item" title={`${key}: ${val}`}>
            <span className="csb-key">{key}:</span>
            <span className="csb-value csb-value-compact">{displayVal}</span>
          </span>
        );
      })}

      {/* Total key count badge */}
      {!loading && totalKeys > 0 && (
        <span className="csb-badge" title={`${totalKeys} context keys`}>
          {totalKeys}
        </span>
      )}

      {/* System state indicator: active window + CPU load */}
      {systemState && (
        <span className="csb-system" title={`System: ${systemState.load.cpu_percent}% CPU | ${systemState.load.ram_percent}% RAM | Active: ${systemState.active_window}`}>
          <span className="csb-system-window" title={`Active window: ${systemState.active_window}`}>
            <span className="csb-icon">🖥</span>
            <span className="csb-value csb-value-compact">
              {systemState.active_window_basename || systemState.active_window}
            </span>
          </span>
          <span className="csb-system-cpu" title={`CPU: ${systemState.load.cpu_percent}%`}>
            <span className={`csb-cpu-bar ${systemState.load.cpu_percent > 80 ? 'csb-cpu-high' : systemState.load.cpu_percent > 50 ? 'csb-cpu-mid' : ''}`}
                  style={{ width: `${Math.min(systemState.load.cpu_percent, 100)}%` }} />
            <span className="csb-cpu-text">{systemState.load.cpu_percent}%</span>
          </span>
          <span className="csb-system-ram" title={`RAM: ${systemState.load.ram_percent}%`}>
            <span className={`csb-ram-bar ${systemState.load.ram_percent > 80 ? 'csb-ram-high' : systemState.load.ram_percent > 50 ? 'csb-ram-mid' : ''}`}
                  style={{ width: `${Math.min(systemState.load.ram_percent, 100)}%` }} />
            <span className="csb-ram-text">{systemState.load.ram_percent}%</span>
          </span>
        </span>
      )}

      {/* Right: live indicator */}
      {!loading && (
        <span className="csb-live" title="Shared context — live from backend cache">
          <span className="csb-live-dot" /> context
        </span>
      )}
    </div>
  );
}
