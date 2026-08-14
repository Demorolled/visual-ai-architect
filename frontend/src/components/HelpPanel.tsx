import { useState, useMemo, useCallback, useEffect } from 'react';
import './HelpPanel.css';

interface HelpSection {
  id: string;
  icon: string;
  title: string;
  content: string[];
}

const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'getting-started',
    icon: '🚀',
    title: 'Getting Started',
    content: [
      'When you first open the app, a **Master Node** (blueprint) is automatically placed on the canvas. This is where you define your app goal.',
      '**Step 1:** Click the Master Node and fill in your app goal and purpose in the right-side detail panel.',
      '**Step 2:** Drag nodes from the **Nodes** sidebar onto the 3D canvas to design your app architecture.',
      '**Step 3:** Click each node to describe what it should do in plain English.',
      '**Step 4:** Click **⚡ Generate Code** in the toolbar to have the AI build your app.',
      '**Step 5:** Review the generated code, then **Approve & Save** to store your design.',
    ],
  },
  {
    id: 'canvas',
    icon: '🎨',
    title: '3D Canvas',
    content: [
      'The canvas is a Three.js 3D scene where you visually build your application architecture.',
      '**Pan:** Click and drag with the mouse to move the camera.',
      '**Zoom:** Scroll to zoom in and out.',
      '**Rotate:** Hold right mouse button and drag to orbit the camera around the scene.',
      '**Auto-Orbit:** The camera slowly drifts around the scene — interact to take control.',
      '**Nodes gently float** up and down. Hover over a node to see it lift and pulse.',
      '**Edges show flowing dashes** — data appears to stream between connected nodes.',
      '**Drag from Palette:** Drag a node type from the right sidebar onto the canvas to create it.',
      '**Double-click a node** to open its code editor.',
      '**Click a node** to select it and view its details in the right panel.',
    ],
  },
  {
    id: 'node-types',
    icon: '📦',
    title: 'Node Types',
    content: [
      '**⬅ Input** — Data entry point. Handles user input, file loading, or external data ingestion.',
      '**➡ Output** — Result display. Renders output, exports files, or sends data to external systems.',
      '**⚙ Logic** — Processing/conditions. Core business logic, calculations, transformations.',
      '**🌐 API** — External service call. REST/GraphQL requests, third-party integrations.',
      '**📦 Database** — Data storage. Reads/writes to databases, file systems, or caches.',
      '**🖥 UI** — User interface element. Screens, components, or CLI interfaces.',
      '**🎛 UI Functions** — Generates control suggestions (buttons, sliders, displays) for the UI canvas. Drag individual controls onto the canvas to create UI nodes.',
      '**⛭ GUI Layout** — Imported GUI widget layout.',
      '**🎯 Master Node** — The app blueprint. Sets the project goal, purpose, and target OS.',
    ],
  },
  {
    id: 'workflow',
    icon: '📋',
    title: 'Design Workflow',
    content: [
      'The workflow bar at the top tracks your progress through a guided pipeline:',
      '**💡 Idea** → Start by describing your app concept in the Master Node.',
      '**🔍 Search** → (Optional) Browse the reference library or search for existing designs.',
      '**🏗️ Build** → Drag nodes onto the canvas to design your architecture.',
      '**✏️ Fill** → Click each node and write descriptions of what each file/module should do.',
      '**⚡ Code** → Click "Generate Code" to have the AI build all files in parallel.',
      '**📋 Review** → Inspect generated code, file dependencies, and approve the design.',
      '**💾 Save** → The design is saved to the library and a training datasheet is generated.',
      '**✅ Done** → Start a new project or return to editing.',
      'After code generation, if you add new nodes, a **🔄 Rework** button appears to reconnect them.',
    ],
  },
  {
    id: 'node-palette',
    icon: '📦',
    title: 'Node Palette & Sidebar',
    content: [
      'The right sidebar contains the **Node Palette** and **Roadmap** tree view.',
      '**Node Palette:** Lists all available node types. Drag any node onto the 3D canvas.',
      '**On Canvas:** Shows all placed nodes with their types and labels. Click to select, ✕ to delete.',
      '**Delete Selected** / **Clear All** buttons manage the canvas.',
      '**Roadmap:** A hierarchical tree view of your project structure. Click nodes to select, ⚙ to open logic editor.',
      'Use the **▶** button at the top of the sidebar to collapse it for more canvas space.',
      'Each section (Nodes/Roadmap) can be collapsed individually with the ▼/▶ toggle.',
    ],
  },
  {
    id: 'reasoning-panel',
    icon: '💬',
    title: 'LLM Reasoning Panel',
    content: [
      'The panel at the bottom is your AI assistant — it can reason about your design, write code, and take actions.',
      '**Type a message** and press Enter or click Send. The AI will respond with analysis or take actions.',
      '**Voice Assistant:** Click the 🎙 button to enable hands-free mode. Say **"Veronica"** (or "Venorica") followed by your request. The assistant listens for the wake word.',
      '**Voice Commands:** "Add a database node called User Storage", "Delete the API node", "Generate code for the logic node", "Make a calculator app"',
      '**Emotion Analysis:** The app analyzes sentiment in your messages and shows an emotion badge in the header.',
      '**🔊 Read Aloud:** Click the speaker icon on any AI response to hear it spoken via TTS.',
      '**🎤 Push to Talk:** Click the mic button to dictate (hands-free alternative to typing).',
      '**Detach:** Click ↗ to open the reasoning panel in a separate browser window.',
      'The panel has a **Thinking** indicator that shows when the AI is processing.',
    ],
  },

  {
    id: 'code-generation',
    icon: '⚡',
    title: 'Code Generation',
    content: [
      'Click **⚡ Generate Code** in the toolbar to start the AI code generation pipeline.',
      'The AI uses a **per-file architecture**: every node becomes its own standalone source file with proper imports/exports.',
      '**Simple files** (configs, CSS, HTML, README) are delegated to the fast coder models for speed.',
      '**Complex logic** is generated by the primary 7B model acting as architect/delegator.',
      'All node files are generated in parallel for maximum speed, then validated and security-scanned.',
      'A **runtime smoke test** boots the assembled app in headless Chromium and clicks through it automatically.',
      'The **Language** dropdown in the toolbar sets the programming language for all nodes at once.',
      'The **Target OS** selector (🐧🪟🍎📱) determines platform-specific code generation.',
      'After generation, review each file in the **Review** screen before saving.',
      'The app can also run in **offline mode** with simulated generation if the backend is unavailable.',
    ],
  },
  {
    id: 'tts',
    icon: '🔊',
    title: 'Text-to-Speech (TTS)',
    content: [
      'The app supports neural TTS via Microsoft Edge voices for reading AI responses aloud.',
      '**TTS Settings:** Click Settings → TTS Settings to configure voice, pitch, speed, volume, and EQ (bass/mid/high/echo).',
      '**Voices:** Choose from 12+ neural voices including Jenny, Aria, Andrew, Brian, Christopher, and more.',
      '**Read Aloud:** Click the 🔊 speaker icon on any AI response in the Reasoning Panel to hear it spoken.',
      'TTS works with both text input and AI-generated responses for a more interactive experience.',
    ],
  },
  {
    id: 'keyboard-shortcuts',
    icon: '⌨',
    title: 'Keyboard Shortcuts',
    content: [
      '**Ctrl+Z / Cmd+Z** — Undo last action',
      '**Ctrl+Shift+Z / Cmd+Shift+Z** — Redo last undone action',
      '**Ctrl+Y / Cmd+Y** — Redo (alternative)',
      '**Escape** — Close any open modals or dialogs',
      '**Enter** — Send message in the reasoning panel',
      '**Shift+Enter** — New line in the reasoning input',
    ],
  },
  {
    id: 'reference-library',
    icon: '📚',
    title: 'Reference Library & Design Bible',
    content: [
      'Click **📚 Library** in the header to open the reference sidebar.',
      '**Library Tab:** Browse saved design patterns, architecture guides, and reference files. Each file has a title, description, and preview.',
      '**Bible Tab:** Browse the hierarchical "Design Bible" — a structured collection of architectural patterns organized by level.',
      'Use the **search bar** to filter files and Bible levels.',
      'Click any file to view its content rendered as formatted Markdown.',
      'The reference library is loaded from the backend and automatically updated as you save designs.',
    ],
  },
  {
    id: 'project-management',
    icon: '💾',
    title: 'Project Management',
    content: [
      'The **Project Manager** (Save/Load/Export/Import buttons) handles your saved projects.',
      '**Save** — Saves the current project to browser local storage.',
      '**Load** — Opens the saved projects list. Click a project card to restore it.',
      '**Export** — Downloads the current project as a .json file.',
      '**Import** — Load a previously exported .json project file.',
      '**New** — Clears everything and starts a fresh project.',
      '**Settings** dropdown:',
      '  - **🔊 TTS Settings** — Voice, pitch, speed, volume, EQ controls',
      '  - **🎨 Design Manifesto** — Set preferences that guide the AI\'s design decisions',
      '**📋 History** — Shows build history with per-node status, progress, and file locations.',
    ],
  },
  {
    id: 'llm-config',
    icon: '🧠',
    title: 'LLM Configuration',
    content: [
      'The app uses Ollama with a local model for all code generation and reasoning.',
      '**Model:** gemma-3-12b-it-abliterated via Ollama (http://127.0.0.1:11434/v1)',
      '**If the model isn\'t pulled yet:**',
      '  `ollama pull hf.co/mlabonne/gemma-3-12b-it-abliterated-GGUF:Q8_0`',
      'The status indicator in the header shows 🟢 Connected, 🟡 Testing, or 🔴 Offline.',
    ],
  },
  {
    id: 'build-history',
    icon: '📋',
    title: 'Build History',
    content: [
      'The **📋 History** button opens a sidebar with detailed build records for every code generation.',
      'Each build shows:',
      '  - Project name and target OS',
      '  - Number of nodes and their status (✅ Done, ⏳ Busy, ❌ Error, ⬜ Pending)',
      '  - Progress percentage with a visual bar',
      '  - Export path (file system location of generated code)',
      '  - Per-node file list and status',
      '  - Build timestamp',
      'Click a build card to expand and see full details including the file dependency graph.',
      'Use 🗑️ to clear all build history.',
    ],
  },
  {
    id: 'emotion-engine',
    icon: '💜',
    title: 'Emotion Engine',
    content: [
      'The Emotion Engine analyzes the sentiment and emotional tone of your messages to the AI.',
      '**Emotions detected:** Joy, Sadness, Anger, Fear, Surprise, Trust, Anticipation, Neutral.',
      'The current emotion is displayed as a badge with icon in the header and reasoning panel.',
      'The AI adapts its communication style based on the detected emotion.',
      'Emotions fade after a period of inactivity.',
      'The **EQ Indicator** in the header shows a visual representation of the emotional state.',
    ],
  },
  {
    id: 'design-manifesto',
    icon: '🎨',
    title: 'Design Manifesto',
    content: [
      'The **Design Manifesto** lets you set preferences that guide the AI\'s code generation.',
      'Access it via **Settings → Design Manifesto**.',
      'Write custom instructions about coding style, frameworks, architecture preferences, and more.',
      'The manifesto is saved and sent to the AI during code generation as system context.',
      'Click **Reset** to restore the default template.',
      'Auto-saves with Ctrl+S / Cmd+S.',
    ],
  },
  {
    id: 'auto-save',
    icon: '💾',
    title: 'Auto-Save & Context Status',
    content: [
      'The **Auto-Save Panel** shows the last save time and backup status.',
      'Projects are automatically saved to local storage to prevent data loss.',
      'The **Context Status Bar** shows shared context between the architect and connected services.',
      'A **Connection Indicator** in the header shows backend connectivity status (especially for mobile/desktop apps).',
    ],
  },
];

export default function HelpPanel({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>('getting-started');

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleSection = useCallback((id: string) => {
    setExpandedSection(prev => prev === id ? null : id);
  }, []);

  const filteredSections = useMemo(() => {
    if (!search.trim()) return HELP_SECTIONS;
    const q = search.toLowerCase();
    return HELP_SECTIONS.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.content.some(c => c.toLowerCase().includes(q))
    );
  }, [search]);

  const totalContentLines = useMemo(() => {
    return HELP_SECTIONS.reduce((sum, s) => sum + s.content.length, 0);
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div className="help-overlay" onClick={onClose} />

      {/* Panel */}
      <div className="help-panel">
        {/* Header */}
        <div className="help-header">
          <div className="help-header-top">
            <span className="help-title">📖 User Manual</span>
            <button className="help-close-btn" onClick={onClose}>✕</button>
          </div>
          <div className="help-search">
            <span className="help-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search help topics..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="help-search-input"
              autoFocus
            />
            {search && (
              <button className="help-search-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>
          <div className="help-meta">
            <span>Veronica</span>
            <span className="help-meta-dot">·</span>
            <span>{HELP_SECTIONS.length} topics</span>
            <span className="help-meta-dot">·</span>
            <span>{totalContentLines} help items</span>
            <span className="help-meta-dot">·</span>
            <span className="help-status-dot" />
            <span>Interactive</span>
          </div>
        </div>

        {/* Body */}
        <div className="help-body">
          {filteredSections.length === 0 ? (
            <div className="help-empty">
              <span className="help-empty-icon">🔍</span>
              <span>No help topics match "<strong>{search}</strong>"</span>
              <button className="help-empty-clear" onClick={() => setSearch('')}>Clear search</button>
            </div>
          ) : (
            filteredSections.map(section => (
              <div
                key={section.id}
                className={`help-section ${expandedSection === section.id ? 'expanded' : ''}`}
              >
                <button
                  className="help-section-header"
                  onClick={() => toggleSection(section.id)}
                >
                  <span className="help-section-icon">{section.icon}</span>
                  <span className="help-section-title">{section.title}</span>
                  <span className="help-section-toggle">
                    {expandedSection === section.id ? '▼' : '▶'}
                  </span>
                </button>
                {expandedSection === section.id && (
                  <div className="help-section-body">
                    {section.content.map((line, idx) => {
                      // Render bold, code, and inline formatting
                      const formatted = line
                        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                        .replace(/`([^`]+)`/g, '<code>$1</code>')
                        .replace(/^(\s*-\s+)/, '<span class="help-bullet">•</span> ');

                      // Check for sub-items (indented with two spaces)
                      const isSubItem = line.startsWith('  -');
                      const isHeader = line.includes(':') && !line.startsWith(' ') && line.length < 50;

                      if (line.trim() === '') return null;

                      return (
                        <p
                          key={idx}
                          className={`help-line ${isSubItem ? 'help-sub-item' : ''} ${isHeader ? 'help-section-subheader' : ''}`}
                          dangerouslySetInnerHTML={{ __html: formatted }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="help-footer">
          <button className="help-footer-link" onClick={() => {
            setSearch('');
            setExpandedSection(null);
            const allIds = HELP_SECTIONS.map(s => s.id);
            // Expand first 3 sections
            allIds.slice(0, 3).forEach(id => toggleSection(id));
          }}>
            🔄 Show Overview
          </button>
          <span className="help-footer-text">
            Press <kbd>Esc</kbd> to close
          </span>
        </div>
      </div>

    </>
  );
}
