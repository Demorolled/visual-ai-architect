/**
 * IntentParser — IPC Bridge Schema (Frontend)
 * ============================================
 *
 * Structured "Intent Packets" that flow between the terminal and Architect.
 *
 * When the user types `/add-button Submit` in the terminal, it becomes:
 *   { type: 'widget_create', payload: { type: 'button', label: 'Submit' },
 *     source: 'terminal', timestamp: '...', id: 'intent_...' }
 */

/** All supported intent types */
export type IntentType =
  | 'widget_create'       // Create a widget on the canvas
  | 'widget_select'       // Select a widget by id or label
  | 'widget_delete'       // Delete a widget by id or label
  | 'widget_update'       // Update widget properties
  | 'theme_set'           // Set app theme
  | 'context_set'         // Set a shared context key/value
  | 'navigate'            // Navigate to a module
  | 'ping';               // Heartbeat / test

/** Source of the intent */
export type IntentSource = 'terminal' | 'architect' | 'cli' | 'system';

/** Structured intent packet */
export interface IntentPacket {
  type: IntentType;
  payload: Record<string, any>;
  source: IntentSource;
  timestamp: string;
  id: string;
}

/** Create a new IntentPacket with auto-generated id and timestamp */
export function createIntent(
  type: IntentType,
  payload: Record<string, any>,
  source: IntentSource = 'terminal',
): IntentPacket {
  return {
    type,
    payload,
    source,
    timestamp: new Date().toISOString(),
    id: `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

/** Try to parse a terminal command string into an IntentPacket. Returns null if not a command. */
export function parseCommandToIntent(
  input: string,
  source: IntentSource = 'terminal',
): IntentPacket | null {
  const trimmed = input.trim();

  // Must start with /
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case 'add-button':
    case 'add-btn':
      return createIntent('widget_create', {
        type: 'button',
        label: args.join(' ') || 'New Button',
        x: 100, y: 100,
      }, source);

    case 'add-slider':
      return createIntent('widget_create', {
        type: 'slider',
        label: args.join(' ') || 'Slider',
        x: 100, y: 160,
      }, source);

    case 'add-toggle':
      return createIntent('widget_create', {
        type: 'toggle',
        label: args.join(' ') || 'Toggle',
        x: 100, y: 220,
      }, source);

    case 'add-display':
    case 'add-label':
      return createIntent('widget_create', {
        type: command === 'add-label' ? 'label' : 'display',
        label: args.join(' ') || 'Display',
        x: 100, y: 280,
      }, source);

    case 'select':
    case 'pick':
      return createIntent('widget_select', {
        label: args.join(' '),
      }, source);

    case 'delete':
    case 'remove':
      return createIntent('widget_delete', {
        label: args.join(' '),
      }, source);

    case 'set-theme':
    case 'theme':
      return createIntent('theme_set', {
        theme: args[0] || 'dark',
      }, source);

    case 'set':
      // /set key value
      return createIntent('context_set', {
        key: args[0] || '',
        value: args.slice(1).join(' ') || '',
      }, source);

    case 'navigate':
    case 'go':
      return createIntent('navigate', {
        module: args[0] || 'gui',
      }, source);

    case 'ping':
      return createIntent('ping', {}, source);

    default:
      return null; // Not a recognized command — pass through to LLM
  }
}

/** Friendly help text for available commands */
export const INTENT_COMMAND_HELP = [
  'Available commands (type /command in the terminal):',
  '  /add-button <label>     — Add a button widget',
  '  /add-slider <label>     — Add a slider widget',
  '  /add-toggle <label>     — Add a toggle widget',
  '  /add-display <label>    — Add a display widget',
  '  /add-label <text>       — Add a label widget',
  '  /select <label>         — Select a widget by label',
  '  /delete <label>         — Delete a widget by label',
  '  /theme <name>           — Set theme (dark, neon-sunset, etc.)',
  '  /set <key> <value>      — Set a shared context value',
  '  /navigate <module>      — Navigate to module (gui, image, audio, apps)',
  '  /system                  — Show system state (processes, load, active window)',
  '  /system start            — Launch the System Awareness Daemon',
  '  /system stop             — Stop the daemon',
  '  /screenshot              — Capture a screenshot',
  '  /screenshot describe     — Capture + describe screen with vision LLM',
  '  /screenshot auto         — Toggle automatic screenshot injection on/off',
  '  /screenshot auto on      — Enable auto-screenshot (LLMs see your screen)',
  '  /screenshot auto off     — Disable auto-screenshot',
  '  /screenshot what\'s on my screen?  — Quick vision description',
  '  /debug-prompt            — Show exactly what context is injected into each LLM\'s system prompt',
  '  /debug-prompt full       — Show full prompts without truncation',
  '  /session-save [label]   — Save current session, get a code (e.g. sess-x92a)',
  '  /session-load <code>    — Load a session by code',
  '  /session-list           — List all saved sessions',
  '  /help                   — Show this help message',
].join('\n');

export async function sendIntentToBackend(_intent: IntentPacket): Promise<{
  success: boolean;
  bridgeSent: boolean;
}> {
  return { success: true, bridgeSent: true };
}

/** Format an intent into a user-friendly confirmation message */
export function formatIntentConfirmation(intent: IntentPacket, success: boolean): string {
  const emoji = success ? '✅' : '⚠️';
  switch (intent.type) {
    case 'widget_create':
      return `${emoji} Created **${intent.payload.label}** (${intent.payload.type})`;
    case 'widget_select':
      return `${emoji} Selected **${intent.payload.label}**`;
    case 'widget_delete':
      return `${emoji} Deleted **${intent.payload.label}**`;
    case 'theme_set':
      return `${emoji} Theme set to **${intent.payload.theme}**`;
    case 'context_set':
      return `${emoji} Context \`${intent.payload.key}\` set to \`${intent.payload.value}\``;
    case 'navigate':
      return `${emoji} Navigating to **${intent.payload.module}** module`;
    case 'ping':
      return `${emoji} Bridge pinged (connected: ${success})`;
    default:
      return `${emoji} Intent \`${intent.type}\` sent`;
  }
}
