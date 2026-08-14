/**
 * MockupPreviewPanel — the "planned interface" view inside the floating
 * preview window.
 *
 * When the chat's 🖥 Show Preview is pressed and nothing has been generated
 * yet (no site preview URL, no node with generated code), App.tsx calls the
 * deterministic /api/blueprint/mockup endpoint and shows the resulting
 * GUI mockup image here — "how the app's interface should look" before any
 * code exists. Once real code is generated, the window switches back to the
 * LivePreviewPanel.
 */

import { useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import './MockupPreviewPanel.css';

export interface MockupPreviewData {
  appType: string;
  matchScore: number;
  modules: string[];
  imageBase64: string;
  html: string;
}

interface Props {
  loading: boolean;
  error: string;
  mockup: MockupPreviewData | null;
  /** The description this mockup was designed from — used to build the app. */
  goal?: string;
  purpose?: string;
}

export default function MockupPreviewPanel({ loading, error, mockup, goal, purpose }: Props) {
  const [building, setBuilding] = useState(false);

  const handleBuildNow = () => {
    if (!goal?.trim()) return;
    setBuilding(true);
    // Bump the blueprint request token — App.tsx closes this window and opens
    // the pre-filled BlueprintBuildDialog, which auto-starts the build.
    useProjectStore.getState().requestBlueprintBuild(goal, purpose);
  };

  if (loading) {
    return (
      <div className="mpp-state mpp-loading">
        <div className="mpp-spinner" />
        <div>🎨 Designing your GUI mockup…</div>
      </div>
    );
  }

  if (error && !mockup) {
    return (
      <div className="mpp-state mpp-error">
        <div className="mpp-error-title">❌ Could not show a preview</div>
        <div className="mpp-error-detail">{error}</div>
        <div className="mpp-error-hint">
          Once the app is built, Show Preview displays the live app instead.
        </div>
      </div>
    );
  }

  if (!mockup) {
    return (
      <div className="mpp-state">
        <div className="mpp-empty-title">🖥 Nothing to preview yet</div>
        <div className="mpp-empty-detail">
          No app has been generated on the canvas, and there is no description
          to design a mockup from. Describe your app in the chat or the wizard
          first, then ask for a preview.
        </div>
      </div>
    );
  }

  return (
    <div className="mpp-wrap">
      <div className="mpp-head">
        <span className="mpp-title">🎨 Planned interface — no code generated yet</span>
        <span className="mpp-badge">{mockup.appType}</span>
      </div>
      <div className="mpp-meta">
        Blueprint match <strong>{(mockup.matchScore * 100).toFixed(0)}%</strong> ·{' '}
        {mockup.modules.length} module{mockup.modules.length !== 1 ? 's' : ''} ·{' '}
        <em>this is how the app should look</em>
      </div>
      <div className="mpp-frame">
        {mockup.imageBase64 ? (
          <img
            className="mpp-img"
            src={`data:image/png;base64,${mockup.imageBase64}`}
            alt={`GUI mockup for ${mockup.appType}`}
          />
        ) : (
          <iframe
            className="mpp-iframe"
            sandbox="allow-scripts"
            title={`GUI mockup for ${mockup.appType}`}
            srcDoc={mockup.html}
          />
        )}
      </div>
      <div className="mpp-modules">
        {mockup.modules.slice(0, 8).map(mod => (
          <span key={mod} className="mpp-module">{mod}</span>
        ))}
        {mockup.modules.length > 8 && (
          <span className="mpp-module">+{mockup.modules.length - 8} more</span>
        )}
      </div>
      {goal?.trim() && (
        <button
          className="mpp-build-btn"
          onClick={handleBuildNow}
          disabled={building}
        >
          {building ? '⏳ Starting build…' : '⚡ Build This Now'}
        </button>
      )}
    </div>
  );
}
