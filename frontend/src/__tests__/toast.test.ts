import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useToast, showToast } from '../utils/toast';

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToast.getState().dismiss();
  });
  afterEach(() => {
    useToast.getState().dismiss();
    vi.useRealTimers();
  });

  it('starts empty', () => {
    expect(useToast.getState().message).toBeNull();
  });

  it('shows a message and defaults to the success tone', () => {
    showToast('hello');
    expect(useToast.getState().message).toBe('hello');
    expect(useToast.getState().tone).toBe('success');
  });

  it('accepts an explicit tone', () => {
    showToast('fyi', 'info');
    expect(useToast.getState().tone).toBe('info');
  });

  it('auto-dismisses after the duration', () => {
    showToast('bye', 'success', 3000);
    expect(useToast.getState().message).toBe('bye');
    vi.advanceTimersByTime(2999);
    expect(useToast.getState().message).toBe('bye');
    vi.advanceTimersByTime(1);
    expect(useToast.getState().message).toBeNull();
  });

  it('a newer toast replaces the previous and restarts the clock', () => {
    showToast('first', 'success', 3000);
    vi.advanceTimersByTime(2000);
    showToast('second', 'success', 3000);
    vi.advanceTimersByTime(2000); // 2s after the second toast
    expect(useToast.getState().message).toBe('second');
    vi.advanceTimersByTime(1000);
    expect(useToast.getState().message).toBeNull();
  });

  it('dismiss clears immediately and cancels the timer', () => {
    showToast('now');
    useToast.getState().dismiss();
    expect(useToast.getState().message).toBeNull();
    // A pending timer must not fire onto a fresh toast.
    showToast('new one', 'success', 3000);
    vi.advanceTimersByTime(3000);
    expect(useToast.getState().message).toBeNull();
  });
});
