import { useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';

export default function GlobalShortcuts() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Escape: close modals
      if (e.key === 'Escape') {
        document.querySelector<HTMLElement>('.settings-modal-overlay')?.click();
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const state = useProjectStore.getState();
        if (state.canUndo) {
          state.undo();
        }
        return;
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z  or  Ctrl+Y / Cmd+Y
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const state = useProjectStore.getState();
        if (state.canRedo) {
          state.redo();
        }
        return;
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return null;
}
