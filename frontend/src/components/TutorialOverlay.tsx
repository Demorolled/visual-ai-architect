import { useState, useEffect, useCallback } from 'react';
import './TutorialOverlay.css';
import { TUTORIAL_KEY } from '../utils/tutorialUtils';

interface TutorialStep {
  icon: string;
  title: string;
  subtitle: string;
  body: string;
  highlight: string;
  tip: string;
}

const STEPS: TutorialStep[] = [
  {
    icon: '🚀',
    title: 'Welcome to Veronica!',
    subtitle: 'Build apps visually with AI-powered code generation',
    body: 'Design your application architecture on a 3D canvas, describe each component in plain English, and let the AI generate production-ready code. This quick tour will show you the essentials.',
    highlight: 'app-header',
    tip: 'You can reopen this guide anytime via the ❓ Help button in the header.',
  },
  {
    icon: '🎯',
    title: 'Start with the Blueprint',
    subtitle: 'The Master Node is your app\'s brain',
    body: 'A Master Node is automatically placed on the canvas. Click it to open the detail panel on the right, then type your app goal and purpose. This tells the AI what you want to build.',
    highlight: 'canvas-area',
    tip: 'Try: "Build a weather dashboard that shows forecasts from an API"',
  },
  {
    icon: '🎨',
    title: 'Explore the 3D Canvas',
    subtitle: 'Pan, zoom, rotate — the scene is alive',
    body: 'Your app architecture lives in a 3D space. Pan with click-drag, zoom with scroll, orbit with right-click drag. Nodes float gently, edges pulse with flowing dashes, and the camera slowly auto-orbits.',
    highlight: 'canvas-area',
    tip: 'Double-click any node to open its code editor.',
  },
  {
    icon: '📦',
    title: 'Add Nodes from the Palette',
    subtitle: 'Drag & drop to design your architecture',
    body: 'The right sidebar has a Node Palette with 8 node types: Input, Output, Logic, API, Database, UI, UI Functions, and GUI Layout. Drag any node onto the canvas. After dropping, give it a name and description.',
    highlight: 'sidebar-right',
    tip: 'UI Functions are special — they generate button/control suggestions for the UI canvas.',
  },
  {
    icon: '💬',
    title: 'Chat with the AI Assistant',
    subtitle: 'Voice or text — Veronica listens',
    body: 'The bottom panel is your LLM Reasoner. Type a message or enable the voice assistant by clicking 🎙. Say "Veronica" followed by your request — "Add a database node", "Make a calculator app", or "Generate code".',
    highlight: 'terminal-section',
    tip: 'The AI can detect emotion in your messages and will adapt its tone.',
  },
  {
    icon: '⚡',
    title: 'Generate Code & Save',
    subtitle: 'From architecture to working app',
    body: 'When your architecture is ready, click ⚡ Generate Code in the toolbar. The AI builds all files in parallel (infrastructure → logic → connectivity). Review the generated code, then Approve & Save to store your design in the library.',
    highlight: 'toolbar',
    tip: 'After saving, the AI generates a training datasheet to improve future generations.',
  },
];

export default function TutorialOverlay({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  const totalSteps = STEPS.length;
  const current = STEPS[step];
  const isLast = step === totalSteps - 1;
  const progress = ((step + 1) / totalSteps) * 100;

  // Mark tutorial as seen on completion
  const finish = useCallback(() => {
    localStorage.setItem(TUTORIAL_KEY, 'true');
    setExiting(true);
    setTimeout(() => onComplete(), 300);
  }, [onComplete]);

  const next = useCallback(() => {
    if (isLast) {
      finish();
    } else {
      setStep(s => s + 1);
    }
  }, [isLast, finish]);

  const prev = useCallback(() => {
    if (step > 0) setStep(s => s - 1);
  }, [step]);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev, skip]);

  // Jump to a specific step
  const goToStep = useCallback((idx: number) => {
    setStep(idx);
  }, []);

  return (
    <div className={`tutorial-overlay ${exiting ? 'exiting' : ''}`}>
      {/* Backdrop with highlight ring */}
      <div className="tutorial-backdrop" onClick={skip} />

      {/* Highlight ring around the target element */}
      <div className={`tutorial-highlight tutorial-highlight-${current.highlight}`} />

      {/* Step card */}
      <div className="tutorial-card" onClick={e => e.stopPropagation()}>
        {/* Progress bar */}
        <div className="tutorial-progress">
          <div className="tutorial-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {/* Step indicator */}
        <div className="tutorial-step-indicator">
          <span className="tutorial-step-num">{step + 1}</span>
          <span className="tutorial-step-of">of {totalSteps}</span>
        </div>

        {/* Icon */}
        <div className="tutorial-icon-wrapper">
          <span className="tutorial-icon">{current.icon}</span>
        </div>

        {/* Title */}
        <h2 className="tutorial-title">{current.title}</h2>
        <p className="tutorial-subtitle">{current.subtitle}</p>

        {/* Body */}
        <p className="tutorial-body">{current.body}</p>

        {/* Tip */}
        <div className="tutorial-tip">
          <span className="tutorial-tip-icon">💡</span>
          <span className="tutorial-tip-text">{current.tip}</span>
        </div>

        {/* Dots */}
        <div className="tutorial-dots">
          {STEPS.map((_, idx) => (
            <button
              key={idx}
              className={`tutorial-dot ${idx === step ? 'active' : ''} ${idx < step ? 'done' : ''}`}
              onClick={() => goToStep(idx)}
              aria-label={`Go to step ${idx + 1}`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="tutorial-actions">
          <button className="tutorial-btn tutorial-btn-skip" onClick={skip}>
            Skip Tour
          </button>
          <div className="tutorial-actions-right">
            <button
              className="tutorial-btn tutorial-btn-prev"
              onClick={prev}
              disabled={step === 0}
            >
              ← Back
            </button>
            <button className="tutorial-btn tutorial-btn-next" onClick={next}>
              {isLast ? '🚀 Get Started' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

