import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import { performAutoSave, AutoSaveSnapshot } from '../utils/autoSave';

const INTERVAL_MS = 15 * 60 * 1000;

export function useAutoSave() {
  const lastRef = useRef<string>('');

  useEffect(() => {
    const save = () => {
      const state = useProjectStore.getState();
      if (!state.projectId) return;

      const snapshot: AutoSaveSnapshot = {
        nodes: state.nodes,
        edges: state.edges,
        targetOS: state.targetOS,
        projectName: state.projectName,
      };

      const key = JSON.stringify(snapshot);
      if (key === lastRef.current) return;

      performAutoSave(state.projectId, snapshot);
      lastRef.current = key;
    };

    const interval = setInterval(save, INTERVAL_MS);

    const handleBeforeUnload = () => save();
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
}
