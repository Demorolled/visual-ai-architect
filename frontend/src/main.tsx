import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Apply global fetch override for Capacitor device support
// Intercepts /api/* and /health calls, prepending the configured backend URL
import { applyFetchOverride } from './utils/apiUrl';
if (typeof window !== 'undefined') {
  applyFetchOverride();
}

// Hover narration — speaks a technical deep-dive when the pointer rests on a
// headline control. Audio only, nothing drawn. Inert unless explicitly enabled:
// build with VITE_VACA_NARRATION=1, or set localStorage['vaca-narration'] to '1'.
// See src/narration/narrationMap.ts for the text and hoverNarration.ts for the
// matching rules.
import { installHoverNarration } from './narration/hoverNarration';
installHoverNarration();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
