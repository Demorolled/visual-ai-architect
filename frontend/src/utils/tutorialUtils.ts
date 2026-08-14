const TUTORIAL_KEY = 'vaia-tutorial-seen';

export { TUTORIAL_KEY };

/**
 * Returns true if the user has already completed the tutorial.
 */
export function hasSeenTutorial(): boolean {
  return localStorage.getItem(TUTORIAL_KEY) === 'true';
}

/**
 * Reset the tutorial flag so it shows again on next launch.
 */
export function resetTutorial(): void {
  localStorage.removeItem(TUTORIAL_KEY);
}
