/**
 * FloatingPreviewWindow — a small draggable/resizable floating preview window.
 *
 * Features:
 * - Drag by the title bar to move anywhere (including outside the app)
 * - Resize from bottom-right corner
 * - Minimize to a taskbar-style icon
 * - Close when done
 * - Remembers position/size in localStorage
 * - Lives outside the app layout (position: fixed, high z-index)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './FloatingPreviewWindow.css';

interface FloatingPreviewWindowProps {
  /** The content to render inside the floating window */
  children: React.ReactNode;
  /** Whether the window is visible */
  isOpen: boolean;
  /** Callback when the window is closed */
  onClose: () => void;
  /** Callback when the window is minimized */
  onMinimize?: () => void;
  /** Window title shown in the title bar */
  title?: string;
  /** Window icon emoji */
  icon?: string;
}

// Default dimensions
const DEFAULT_WIDTH = 520;
const DEFAULT_HEIGHT = 400;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;

// Storage key for position/size persistence
const STORAGE_KEY = 'vaca-floating-preview-state';

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadWindowState(): WindowState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return null;
}

function saveWindowState(state: WindowState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export default function FloatingPreviewWindow({
  children,
  isOpen,
  onClose,
  onMinimize,
  title = 'Live Preview',
  icon = '🖥',
}: FloatingPreviewWindowProps) {
  const savedState = loadWindowState();

  // Position: center on first open, or restore saved position
  const [position, setPosition] = useState(() => ({
    x: savedState?.x ?? Math.max(40, window.innerWidth - DEFAULT_WIDTH - 60),
    y: savedState?.y ?? 80,
  }));

  const [size, setSize] = useState(() => ({
    width: savedState?.width ?? DEFAULT_WIDTH,
    height: savedState?.height ?? DEFAULT_HEIGHT,
  }));

  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0 });
  const resizeRef = useRef({ startX: 0, startY: 0, startW: 0, startH: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  // ── Persist position/size ──
  useEffect(() => {
    if (isOpen && !isMinimized) {
      saveWindowState({ x: position.x, y: position.y, width: size.width, height: size.height });
    }
  }, [position, size, isOpen, isMinimized]);

  // ── Drag handlers ──
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Only allow dragging from the title bar, not from buttons
    const target = e.target as HTMLElement;
    if (!target.closest('.fpw-title-bar')) return;
    if (target.closest('.fpw-title-btn')) return; // don't drag from buttons

    e.preventDefault();
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  }, [position]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const minVisible = 60; // keep at least 60px of the window on screen
    setPosition({
      x: Math.max(-size.width + minVisible, dragRef.current.startPosX + dx),
      y: Math.max(0, dragRef.current.startPosY + dy),
    });
  }, [isDragging, size.width]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ── Resize handlers ──
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: size.width,
      startH: size.height,
    };
  }, [size]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const dx = e.clientX - resizeRef.current.startX;
    const dy = e.clientY - resizeRef.current.startY;
    setSize({
      width: Math.max(MIN_WIDTH, resizeRef.current.startW + dx),
      height: Math.max(MIN_HEIGHT, resizeRef.current.startH + dy),
    });
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // ── Global mouse listeners ──
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'nwse-resize';
      document.body.style.userSelect = 'none';
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // ── Handle minimized state ──
  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
    onMinimize?.();
  }, [onMinimize]);

  const handleRestore = useCallback(() => {
    setIsMinimized(false);
  }, []);

  if (!isOpen) return null;

  // ── Portal to document.body so the window is truly independent ──
  const windowContent = isMinimized ? (
    <div
      className="fpw-minimized-pill"
      onClick={handleRestore}
      title="Restore Preview Window"
      style={{
        left: Math.min(position.x, window.innerWidth - 160),
        top: Math.min(position.y, window.innerHeight - 60),
      }}
    >
      <span className="fpw-minimized-icon">{icon}</span>
      <span className="fpw-minimized-title">{title}</span>
      <span className="fpw-minimized-restore">↗</span>
    </div>
  ) : (
    <div
      ref={windowRef}
      className={`fpw-window ${isDragging ? 'fpw-dragging' : ''} ${isResizing ? 'fpw-resizing' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }}
    >
      {/* ── Title Bar ── */}
      <div
        className="fpw-title-bar"
        onMouseDown={handleDragStart}
      >
        <div className="fpw-title-bar-left">
          <span className="fpw-title-icon">{icon}</span>
          <span className="fpw-title-text">{title}</span>
        </div>
        <div className="fpw-title-bar-actions">
          <button
            className="fpw-title-btn fpw-minimize-btn"
            onClick={handleMinimize}
            title="Minimize"
          >
            ─
          </button>
          <button
            className="fpw-title-btn fpw-close-btn"
            onClick={onClose}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Content Area ── */}
      <div className="fpw-content">
        {children}
      </div>

      {/* ── Resize Handle (bottom-right corner) ── */}
      <div
        className="fpw-resize-handle"
        onMouseDown={handleResizeStart}
        title="Resize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="6" y1="10" x2="10" y2="6" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
          <line x1="3" y1="10" x2="10" y2="3" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );

  return createPortal(windowContent, document.body);
}
