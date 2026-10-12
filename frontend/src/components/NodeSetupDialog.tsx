/**
 * NodeSetupDialog — the window that opens when a node is dropped on the canvas.
 *
 * Replaces the old inline "New Node" prompt, which only collected a name and a
 * description and then silently took the node's LANGUAGE from
 * `userProfile.preferences.preferredLanguages[0]`. That made the language
 * invisible at the moment it is actually decided: you could drag a node for a
 * Rust module onto the canvas and get a TypeScript node without being told.
 * Here the language is an explicit pulldown, per node.
 *
 * Two shapes, same window:
 *   - build mode: "New node" — type/language/name/purpose for an added node.
 *   - plan mode, first node (`isSeed`): "Start your plan" — this node is the
 *     statement of intent. Its purpose is what the co-pilot reads to work out
 *     what you are building, so it gets the framed copy.
 */

import { useEffect, useRef, useState } from 'react';
import { CodeLanguage, LANGUAGE_OPTIONS, NodeType } from '../types';
import { NODE_TYPE_OPTIONS } from '../types';
import './NodeSetupDialog.css';

export interface NodeSetupResult {
  type: NodeType;
  language: CodeLanguage;
  name: string;
  purpose: string;
}

interface NodeSetupDialogProps {
  /** Type pre-selected from whatever was dragged onto the canvas. */
  initialType: NodeType;
  /** Seed = the first node of a plan. */
  isSeed?: boolean;
  /** Which mode's copy to show. */
  mode?: 'plan' | 'build';
  defaultLanguage?: CodeLanguage;
  /** Pre-fill from a widget drag (UIFunctionNode supplies a label/description). */
  initialName?: string;
  initialPurpose?: string;
  onConfirm: (result: NodeSetupResult) => void;
  onCancel: () => void;
}

export default function NodeSetupDialog({
  initialType,
  isSeed = false,
  mode = 'build',
  defaultLanguage = 'typescript',
  initialName = '',
  initialPurpose = '',
  onConfirm,
  onCancel,
}: NodeSetupDialogProps) {
  const [type, setType] = useState<NodeType>(initialType);
  const [language, setLanguage] = useState<CodeLanguage>(defaultLanguage);
  const [name, setName] = useState(initialName);
  const [purpose, setPurpose] = useState(initialPurpose);
  void mode; // copy is keyed off `isSeed`; kept in the props for callers' clarity
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const label = NODE_TYPE_OPTIONS.find((o) => o.type === type)?.label ?? type;

  const handleConfirm = () => {
    onConfirm({
      type,
      language,
      name: name.trim() || label,
      purpose: purpose.trim(),
    });
  };

  return (
    <div className="node-name-overlay" onClick={onCancel}>
      <div className="node-name-dialog node-setup-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="node-name-header">
          <span className="node-name-type-badge">{isSeed ? '◉' : '◆'}</span>
          <span className="node-name-title">
            {isSeed ? 'Master node' : `New ${label} node`}
          </span>
        </div>

        {isSeed && (
          <p className="node-setup-blurb">
            This is the master node — the whole design hangs off it. Describe the app you
            are building. VACA reads this to understand the job and then stays alongside
            you: every other node is a function you declare, and the edges are how they
            connect. <strong>Nothing is built or generated while you are in Big Plan
            Mode</strong> — this is design time, and your work is saved as you go.
          </p>
        )}

        <div className="node-setup-row">
          <label className="node-name-field">
            <span>Node type</span>
            <select
              className="node-setup-select"
              value={type}
              onChange={(e) => setType(e.target.value as NodeType)}
            >
              {NODE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.type} value={opt.type}>
                  {opt.icon} {opt.label} — {opt.description}
                </option>
              ))}
            </select>
          </label>

          <label className="node-name-field">
            <span>Language</span>
            <select
              className="node-setup-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as CodeLanguage)}
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="node-name-field">
          <span>Name</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isSeed ? 'e.g. Inventory service' : `New ${label} node`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') onCancel();
            }}
          />
        </label>

        <label className="node-name-field">
          <span>{isSeed ? 'What app are you building?' : 'What function does this node do?'}</span>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder={
              isSeed
                ? 'Describe the app in your own words. What does it do, who is it for, what must it not do?'
                : 'Declare this node\u2019s function: what it does, what it expects, what it hands on to the nodes it connects to.'
            }
            rows={isSeed ? 5 : 3}
          />
        </label>

        <div className="node-name-actions">
          <button className="nn-btn nn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="nn-btn nn-confirm" onClick={handleConfirm}>
            {isSeed ? 'Start designing' : 'Add node'}
          </button>
        </div>
      </div>
    </div>
  );
}
