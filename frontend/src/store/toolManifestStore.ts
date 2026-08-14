import { create } from 'zustand';

export interface ToolManifestEntry {
  name: string;
  description: string;
  category: string;
  input_schema: Record<string, unknown>;
}

interface ToolManifestState {
  /** Formatted text version of the manifest (for display) */
  formattedText: string;
  /** Structured manifest data (for tool palette/filtering) */
  manifest: ToolManifestEntry[];
  /** Grouped by category for easy display */
  grouped: Record<string, ToolManifestEntry[]>;
  /** Whether the manifest has been received from the backend */
  received: boolean;
  /** Set the manifest from a socket broadcast */
  setManifest: (formattedText: string, manifest: ToolManifestEntry[]) => void;
  /** Reset to empty */
  clear: () => void;
}

export const useToolManifestStore = create<ToolManifestState>((set) => ({
  formattedText: '',
  manifest: [],
  grouped: {},
  received: false,

  setManifest: (formattedText, manifest) => {
    const grouped: Record<string, ToolManifestEntry[]> = {};
    for (const entry of manifest) {
      if (!grouped[entry.category]) grouped[entry.category] = [];
      grouped[entry.category].push(entry);
    }
    set({ formattedText, manifest, grouped, received: true });
  },

  clear: () => {
    set({ formattedText: '', manifest: [], grouped: {}, received: false });
  },
}));
