/**
 * Minimal global toast — one message at a time, auto-dismissing.
 *
 * The app already has one-off banners (the preview toast in App.tsx, the rework
 * bar in Canvas.tsx) but no reusable notification. This is the shared one:
 * anything can call `showToast('…')` and `<ToastHost/>` (mounted once in App)
 * renders it. Transient UI only — never persisted.
 */
import { create } from 'zustand';

export type ToastTone = 'success' | 'info';

interface ToastState {
  message: string | null;
  tone: ToastTone;
  show: (message: string, tone?: ToastTone, durationMs?: number) => void;
  dismiss: () => void;
}

// One shared timer: a new toast replaces the previous one and restarts the clock.
let timer: ReturnType<typeof setTimeout> | null = null;

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'success',
  show: (message, tone = 'success', durationMs = 4000) => {
    if (timer) clearTimeout(timer);
    set({ message, tone });
    timer = setTimeout(() => {
      timer = null;
      set({ message: null });
    }, durationMs);
  },
  dismiss: () => {
    if (timer) { clearTimeout(timer); timer = null; }
    set({ message: null });
  },
}));

/** Fire-and-forget helper usable outside React components. */
export function showToast(message: string, tone: ToastTone = 'success', durationMs = 4000): void {
  useToast.getState().show(message, tone, durationMs);
}
