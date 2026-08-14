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
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
