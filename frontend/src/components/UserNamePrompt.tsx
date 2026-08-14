import { useState, useEffect } from 'react';
import { broadcastReasoningMessage } from '../utils/reasoningSync';
import { pushReasoningMessage } from '../utils/sharedTerminalContext';
import { speak, warmupAudio } from '../utils/tts';

const USER_NAME_KEY = 'vaia-user-name';
const WELCOME_SHOWN_KEY = 'vaia-welcome-shown-';

export function getUserName(): string | null {
  return localStorage.getItem(USER_NAME_KEY);
}

function hasWelcomeBeenShown(name: string): boolean {
  return localStorage.getItem(WELCOME_SHOWN_KEY + name) === 'true';
}

function markWelcomeShown(name: string) {
  localStorage.setItem(WELCOME_SHOWN_KEY + name, 'true');
}

export function useUserName() {
  const [name, setName] = useState<string | null>(() => getUserName());
  const set = (n: string) => {
    localStorage.setItem(USER_NAME_KEY, n);
    setName(n);
    fetch('/api/user/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n }),
    }).catch(() => {});
  };
  return { name, setName: set };
}

function postWelcomeMessage(name: string) {
  if (hasWelcomeBeenShown(name)) return;
  markWelcomeShown(name);

  setTimeout(() => {
    const isVirgil = name.toLowerCase() === 'virgil';
    const lines = isVirgil
      ? [
          `Hey ${name}`,
          `its the mad man`,
          `this is a project ive been working on for a few months now, but honestly I have zero people to help fine tune, much less knows how to write code.`,
          `This is a flowchart node based programming system.`,
          `User give the ai blueprint node there wanted app, etc`,
          `The llm helps the user to after filling out the first node, builds a roadmap on the canvas. User then can modify the node, pick a language they prefer. Links the nodes together.`,
          `Once user have defined what they want each node todo, they can hit generate code. The llm then builds a roadmap, to hand off to a code logic llm to build each section (node) then hand back to the reasoning llm.`,
          `To ensure there no "day dreaming" the node are written 1 by 1 from the llm. Once every code has been written out, the reasoning llm connects the dots and test the application.`,
          `Then user can output the app into a custom folder that store all projects great.`,
          `Veronica can be a bit "sassy" but it works for me lol.`,
          `This is still a huge project in progress, but slowly working it out.`,
        ]
      : [
          `Welcome to Veronica, ${name}!`,
          `This is a flowchart-based visual programming system.`,
          `Start by describing your app in the blueprint node, then build out the roadmap.`,
          `When ready, hit Generate Code and the AI will build each node layer by layer.`,
          `Your projects, roadmaps, and code exports are saved to your personal workspace.`,
        ];

    const fullText = lines.join('\n');

    lines.forEach((line, i) => {
      setTimeout(() => {
        const ts = new Date().toISOString();
        const reasoningMsg = { role: 'ai' as const, text: line, timestamp: ts };
        broadcastReasoningMessage(reasoningMsg);
        pushReasoningMessage('ai', line);
      }, i * 500);
    });

    warmupAudio();
    speak(fullText);
  }, 2500);
}

export default function UserNamePrompt({ onSet }: { onSet: (name: string) => void }) {
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = getUserName();
    if (stored) { onSet(stored); return; }
  }, []);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setSaving(true);
    localStorage.setItem(USER_NAME_KEY, trimmed);
    try {
      await fetch('/api/user/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
    } catch {}
    setSaving(false);
    onSet(trimmed);
    postWelcomeMessage(trimmed);
  };

  if (getUserName()) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1a1a2e', border: '1px solid #4a4a6a', borderRadius: 0,
        padding: '28px 32px', minWidth: 340, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18, color: '#e0e0e0' }}>Welcome to Veronica</h2>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#888' }}>
          Enter your name to create a workspace folder for your projects.
        </p>
        <input
          autoFocus
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="Your name..."
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #4a4a6a', borderRadius: 0,
            background: '#0f0f1a', color: '#e0e0e0', fontSize: 14, outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={saving || !input.trim()}
          style={{
            width: '100%', marginTop: 12, padding: '10px 0', border: 'none', borderRadius: 0,
            background: input.trim() ? '#4ade80' : '#2a3a2e', color: input.trim() ? '#0f0f1a' : '#666',
            fontSize: 14, fontWeight: 600, cursor: input.trim() ? 'pointer' : 'default',
          }}
        >
          {saving ? 'Creating workspace...' : 'Get Started'}
        </button>
      </div>
    </div>
  );
}
