export interface NodeDesign {
  type: string;
  label: string;
  description: string;
  language: string;
  usageCount: number;
  source: 'built-in' | 'learned';
}

const STORAGE_KEY = 'vaia-node-designs';

const builtInDesigns: NodeDesign[] = [
  { type: 'input', label: 'User Input', description: 'Captures and validates user input from forms, buttons, or voice', language: 'typescript', usageCount: 0, source: 'built-in' },
  { type: 'output', label: 'Display Output', description: 'Renders results and feedback to the user', language: 'typescript', usageCount: 0, source: 'built-in' },
  { type: 'logic', label: 'Core Logic', description: 'Core application logic, state management, and business rules', language: 'typescript', usageCount: 0, source: 'built-in' },
  { type: 'api', label: 'API Integration', description: 'Connects to external services and APIs', language: 'typescript', usageCount: 0, source: 'built-in' },
  { type: 'database', label: 'Data Storage', description: 'Persists and retrieves application data', language: 'typescript', usageCount: 0, source: 'built-in' },
  { type: 'ui', label: 'User Interface', description: 'Renders the application user interface', language: 'typescript', usageCount: 0, source: 'built-in' },
];

function loadCustom(): NodeDesign[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustom(designs: NodeDesign[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
}

export const nodeDatabase = {
  getAll(): NodeDesign[] {
    return [...builtInDesigns, ...loadCustom()];
  },

  searchByType(type: string): NodeDesign[] {
    return this.getAll().filter(n => n.type === type);
  },

  search(query: string): NodeDesign[] {
    const q = query.toLowerCase();
    return this.getAll().filter(n =>
      n.label.toLowerCase().includes(q) ||
      n.description.toLowerCase().includes(q)
    );
  },

  learnFromNode(node: { type: string; label: string; description: string; language?: string }): void {
    const custom = loadCustom();
    const existing = custom.find(n =>
      n.type === node.type && n.label.toLowerCase() === (node.label || '').toLowerCase()
    );
    if (existing) {
      existing.usageCount++;
      saveCustom(custom);
      return;
    }
    custom.push({
      type: node.type,
      label: node.label,
      description: node.description,
      language: node.language || 'typescript',
      usageCount: 1,
      source: 'learned',
    });
    saveCustom(custom);
  },

  deleteCustom(label: string): void {
    const custom = loadCustom().filter(n => n.label !== label);
    saveCustom(custom);
  },

  count(): number {
    return builtInDesigns.length + loadCustom().length;
  },
};
