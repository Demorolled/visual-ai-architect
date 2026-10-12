import { useProjectStore } from '../store/projectStore';
import { LANGUAGE_OPTIONS, CodeLanguage, OSType } from '../types';
import './Toolbar.css';

interface ToolbarProps {
  onGenerate: () => void;
  onBuild: () => void;
  onExport: () => void;
  onClear: () => void;
  onPlan: () => void;
  onBlueprint: () => void;
}

export default function Toolbar({ onGenerate, onBuild, onExport, onClear, onPlan, onBlueprint }: ToolbarProps) {
  const { isGenerating, generationLayer, projectName, nodes, updateNode, targetOS, setTargetOS, planMode } = useProjectStore();

  const osOptions: { value: OSType; label: string; icon: string }[] = [
    { value: 'windows', label: 'Windows', icon: '🪟' },
    { value: 'mac', label: 'Mac', icon: '🍎' },
    { value: 'ios', label: 'iOS', icon: '📱' },
    { value: 'linux', label: 'Linux', icon: '🐧' },
  ];

  const codeNodes = nodes.filter(n => n.type !== 'master');
  const uniqueLanguages = [...new Set(nodes.map(n => (n.data as any)?.language).filter(Boolean))] as CodeLanguage[];
  const currentGlobalLang = uniqueLanguages.length === 1 ? uniqueLanguages[0] : undefined;

  const handleGlobalLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value as CodeLanguage;
    nodes.forEach((n) => {
      if (n.type !== 'master') {
        updateNode(n.id, { language: lang });
      }
    });
  };

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <span className="toolbar-label">Project: <strong>{projectName}</strong></span>
        <span className="toolbar-label">Phase: <strong>{generationLayer}/3</strong></span>
      </div>

      <div className="toolbar-section">
        <label className="toolbar-lang-label">
          <span>Language:</span>
          <select
            className="toolbar-lang-select"
            value={currentGlobalLang || 'typescript'}
            onChange={handleGlobalLanguageChange}
          >
            {LANGUAGE_OPTIONS.map((lang) => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        </label>

        <div className="toolbar-os-selector">
          <span className="toolbar-label">Target OS:</span>
          <div className="os-buttons">
            {osOptions.map((os) => (
              <button
                key={os.value}
                className={`os-button ${targetOS === os.value ? 'active' : ''}`}
                onClick={() => setTargetOS(os.value)}
                title={os.label}
              >
                <span className="os-icon">{os.icon}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          className={`toolbar-btn plan-btn ${planMode ? 'active' : ''}`}
          onClick={onPlan}
          title={planMode
            ? 'Big Plan Mode is ON — you are designing, not building. Click to leave.'
            : 'Big Plan Mode — design an app as a node graph before anything is built: start from the master node, describe the app, add nodes for each function, then wire them. Nothing is generated while you plan.'}
        >
          {planMode ? '🧭 Big Plan Mode ON' : '🧭 Big Plan Mode'}
        </button>

        <button
          className="toolbar-btn blueprint-btn"
          onClick={onBlueprint}
          title="Build from a plain-language description — matches the 1228-blueprint bible and loads the generated project into the canvas"
        >
          🧠 Build from Description
        </button>

        <button
          className="toolbar-btn generate-btn"
          onClick={onGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? '⏳ Generating...' : '⚡ Generate Code'}
        </button>

        <button
          className="toolbar-btn build-btn"
          onClick={onBuild}
          disabled={isGenerating || codeNodes.length === 0}
          title="Generate code and preview the app"
        >
          {isGenerating ? '⏳ Building...' : '🏗️ Build & Preview'}
        </button>

        <button
          className="toolbar-btn export-btn"
          onClick={onExport}
          disabled={isGenerating}
        >
          📦 Export
        </button>

        <button
          className="toolbar-btn clear-btn"
          onClick={onClear}
        >
          🗑 Clear
        </button>
      </div>
    </div>
  );
}
