/**
 * useCommandParser — React hook for the IPC Bridge
 * =================================================
 *
 * Shared hook used by both TerminalSection and TerminalWindow to parse
 * terminal commands (/add-button, /theme, etc.) into structured IntentPackets,
 * send them through the bridge, and format confirmation messages.
 */

import { useCallback, useRef } from 'react';
import {
  parseCommandToIntent,
  sendIntentToBackend,
  formatIntentConfirmation,
  INTENT_COMMAND_HELP,
  IntentPacket,
} from '../utils/intentParser';
import { broadcastContextUpdate } from '../utils/contextSync';
import {
  saveSession,
  loadSession,
  listSessions,
  isValidSessionCode,
} from '../utils/sessionTunnel';
import { fetchSharedContext } from '../utils/contextSync';
import {
  fetchSystemStatus,
  startDaemon,
  stopDaemon,
  getSystemContextPrompt,
  getModelFactsPrompt,
  isVisionAutoEnabled,
  setVisionAutoEnabled,
} from '../utils/systemAwareness';
import { captureAndDescribe, captureScreenshot } from '../utils/screenshotVision';
import {
  getSassinessLevel,
  getSassyPrompt,
  getPersonality,
  buildPersonalityPrompt,
  syncPersonalityFromSoul,
} from '../utils/emotionConfig';

export interface CommandResult {
  /** The intent that was sent, or null for /help */
  intent: IntentPacket | null;
  /** Message to display in the terminal */
  message: string;
  /** Whether the command was handled (prevents LLM call) */
  handled: boolean;
}

/**
 * Hook that provides command parsing for terminal inputs.
 *
 * @returns handleCommand(input: string) => Promise<CommandResult | null>
 *   - null = not a command, proceed with LLM call
 *   - { handled: true, message } = command was processed
 *   - { handled: false, message: error, intent } = command was recognized but sending failed
 */
export function useCommandParser() {
  const processingRef = useRef(false);

  const handleCommand = useCallback(async (input: string): Promise<CommandResult | null> => {
    if (processingRef.current) return null;

    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return null; // Not a command

    // Handle /help explicitly
    if (trimmed.toLowerCase() === '/help' || trimmed.toLowerCase() === '/commands') {
      return {
        intent: null,
        message: INTENT_COMMAND_HELP,
        handled: true,
      };
    }

    // ── Session commands (handled before intent pipeline) ──
    const parts = trimmed.slice(1).split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    if (command === 'session-save') {
      processingRef.current = true;
      try {
        const label = args.join(' ') || 'Terminal Session';
        // Capture current shared context
        const sharedContext = await fetchSharedContext();
        const result = await saveSession({
          label,
          projectName: sharedContext.projectName || 'Untitled',
          goal: sharedContext.goal || '',
          purpose: sharedContext.purpose || '',
          targetOS: sharedContext.targetOS || 'linux',
          sharedContext,
        });
        if (result) {
          return {
            intent: null,
            message: `✅ Session saved as **${result.code}**\nLabel: ${result.label}\nUse \`/session-load ${result.code}\` in any app to restore this context`,
            handled: true,
          };
        }
        return {
          intent: null,
          message: '⚠️ Failed to save session — backend unreachable',
          handled: true,
        };
      } catch (err: any) {
        return {
          intent: null,
          message: `⚠️ Session save error: ${err?.message || 'Unknown'}`,
          handled: true,
        };
      } finally {
        processingRef.current = false;
      }
    }

    if (command === 'session-load') {
      const code = args[0];
      if (!code || !isValidSessionCode(code)) {
        return {
          intent: null,
          message: '⚠️ Invalid session code. Format: `/session-load sess-xxxx` where xxxx is a 4-character alphanumeric code',
          handled: true,
        };
      }
      processingRef.current = true;
      try {
        const data = await loadSession(code);
        if (data) {
          const contextKeys = Object.keys(data.sharedContext || {}).join(', ') || '(none)';
          return {
            intent: null,
            message: `✅ Loaded session **${code}**\nLabel: ${data.label}\nProject: ${data.projectName}\nGoal: ${data.goal || '(none)'}\nPurpose: ${data.purpose || '(none)'}\nTarget OS: ${data.targetOS}\nNodes: ${(data.nodes || []).length} architecture nodes\nContext keys: ${contextKeys}\nCreated: ${data.createdAt}`,
            handled: true,
          };
        }
        return {
          intent: null,
          message: `⚠️ Session **${code}** not found. Use \`/session-list\` to see available sessions.`,
          handled: true,
        };
      } catch (err: any) {
        return {
          intent: null,
          message: `⚠️ Session load error: ${err?.message || 'Unknown'}`,
          handled: true,
        };
      } finally {
        processingRef.current = false;
      }
    }

    // ── System commands ──
    if (command === 'system') {
      const subcommand = args[0]?.toLowerCase();

      // /system start — launch the daemon
      if (subcommand === 'start') {
        processingRef.current = true;
        try {
          const result = await startDaemon();
          return {
            intent: null,
            message: result.success
              ? '🚀 System Awareness Daemon launched (polling every 5s)'
              : `⚠️ Failed to start daemon: ${result.message}`,
            handled: true,
          };
        } catch (err: any) {
          return {
            intent: null,
            message: `⚠️ Error starting daemon: ${err?.message || 'Unknown'}`,
            handled: true,
          };
        } finally {
          processingRef.current = false;
        }
      }

      // /system stop — stop the daemon
      if (subcommand === 'stop') {
        processingRef.current = true;
        try {
          const result = await stopDaemon();
          return {
            intent: null,
            message: result.success
              ? '🛑 System Awareness Daemon stopped'
              : `⚠️ Failed to stop daemon: ${result.message}`,
            handled: true,
          };
        } catch (err: any) {
          return {
            intent: null,
            message: `⚠️ Error stopping daemon: ${err?.message || 'Unknown'}`,
            handled: true,
          };
        } finally {
          processingRef.current = false;
        }
      }

      // /system status or /system — show current state
      processingRef.current = true;
      try {
        const status = await fetchSystemStatus();

        if (!status.state) {
          return {
            intent: null,
            message: `📡 **System Awareness**\n\nDaemon: ${status.daemon_running ? '● Running' : '○ Stopped'}\nState: No data received yet. Start the daemon with \`/system start\`.`,
            handled: true,
          };
        }

        const s = status.state;
        const daemonStatus = status.daemon_running ? '● Running' : `○ Stopped (data ${status.stale_seconds}s stale)`;
        const staleWarning = status.stale_seconds > 30
          ? '\n\n⚠️ Data is stale — the daemon may not be running. Try \`/system start\`.'
          : '';

        const msg = [
          '📡 **System Awareness**',
          '',
          `Daemon: ${daemonStatus}`,
          `Active Window: **${s.active_window}**`,
          `Processes: ${s.process_count} running`,
          '',
          `**System Load**`,
          `  CPU: ${s.load.cpu_percent}% (${s.load.cpu_count} cores)`,
          `  RAM: ${s.load.ram_percent}% (${s.load.ram_used_gb}GB / ${s.load.ram_total_gb}GB)`,
          `  Disk: ${s.load.disk_percent}% (${s.load.disk_used_gb}GB / ${s.load.disk_total_gb}GB)`,
          `  Uptime: ${s.load.uptime_hours}h`,
          '',
          `**Top CPU Processes**`,
          ...s.top_cpu.slice(0, 5).map(p =>
            `  ${p.cpu_percent}%  ${p.name} (PID ${p.pid})`
          ),
          '',
          `**Top Memory Processes**`,
          ...s.top_memory.slice(0, 3).map(p =>
            `  ${p.memory_mb}MB  ${p.name} (${p.memory_percent}%)`
          ),
          '',
          'Commands:',
          '  \`/system start\`  — Launch the daemon',
          '  \`/system stop\`   — Stop the daemon',
          '  \`/system\`        — Show this overview',
          staleWarning,
        ].join('\n');

        return {
          intent: null,
          message: msg,
          handled: true,
        };
      } catch (err: any) {
        return {
          intent: null,
          message: `⚠️ Failed to fetch system state: ${err?.message || 'Unknown'}\n\nMake sure the backend is running, then try \`/system start\`.`,
          handled: true,
        };
      } finally {
        processingRef.current = false;
      }
    }

    // ── Desktop control command ──
    if (command === 'desktop') {
      const subcommand = args[0]?.toLowerCase();

      // /desktop status — show available desktop control tools
      if (subcommand === 'status') {
        processingRef.current = true;
        try {
          const res = await fetch('/api/desktop/status', { signal: AbortSignal.timeout(5000) });
          if (!res.ok) {
            return { intent: null, message: `⚠️ Desktop status failed (HTTP ${res.status})`, handled: true };
          }
          const data = await res.json();
          if (!data.success) {
            return { intent: null, message: '⚠️ Desktop status unavailable', handled: true };
          }
          const tools = Object.entries(data.tools)
            .filter(([, v]) => v)
            .map(([name]) => `  • ${name.replace(/_/g, ' ')}`)
            .join('\n');
          return {
            intent: null,
            message: `🖥️ **Desktop Control**\nDisplay: ${data.display_server}\nAvailable tools:\n${tools}\n\nUsage: \`/desktop <command>\`\nExamples:\n  \`/desktop open firefox\` — Open Firefox\n  \`/desktop open ~/Documents/project.md\` — Open a file\n  \`/desktop run ls -la\` — Run a command\n  \`/desktop search AI news\` — Search the web\n  \`/desktop type hello world\` — Type text on desktop\n  \`/desktop info system\` — Get system info`,
            handled: true,
          };
        } catch {
          return { intent: null, message: '⚠️ Desktop control backend unreachable', handled: true };
        } finally { processingRef.current = false; }
      }

      // /desktop <anything> — send natural language command to Veronica desktop agent
      processingRef.current = true;
      try {
        const commandText = args.join(' ').trim();
        if (!commandText) {
          return {
            intent: null,
            message: '⚠️ Usage: `/desktop <command>`\nExamples:\n  \`/desktop open firefox\` — Launch an app\n  \`/desktop open ~/project/main.ts\` — Open a file with default app\n  \`/desktop search latest AI news\` — Web search\n  \`/desktop run ls -la\` — Run a shell command\n  \`/desktop type Hello world\` — Type on the desktop\n  \`/desktop what time is it\` — Get system info\n  \`/desktop status\` — Show available tools',
            handled: true,
          };
        }

        const res = await fetch('/api/desktop/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: commandText, voice_mode: false }),
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
          return { intent: null, message: `⚠️ Desktop command failed (HTTP ${res.status})`, handled: true };
        }

        const data = await res.json();
        if (data.success) {
          const actionLabel = data.action.replace(/_/g, ' ');
          let result = `🖥️ **Desktop — ${actionLabel}**\n`;
          if (data.result) result += `${data.result}`;
          return { intent: null, message: result, handled: true };
        }
        return { intent: null, message: `⚠️ ${data.spoken || 'Desktop command failed'}`, handled: true };
      } catch (err: any) {
        return {
          intent: null,
          message: `⚠️ Desktop error: ${err?.message || 'Unknown'}`,
          handled: true,
        };
      } finally {
        processingRef.current = false;
      }
    }

    // ── Debug prompt command ──
    if (command === 'debug-prompt') {
      const showFull = args.includes('full');
      processingRef.current = true;
      try {
        const systemContext = await getSystemContextPrompt();
        const modelFacts = await getModelFactsPrompt();
        // P1: sync the soul traits (data/soul.json) so command flows feel the
        // personality the user actually configured.
        await syncPersonalityFromSoul();
        const personality = getPersonality();
        const personalityPrompt = buildPersonalityPrompt(personality);
        const sassinessLevel = getSassinessLevel();
        const sassyPrompt = getSassyPrompt(sassinessLevel);

        const llm2Base = 'You are an expert code architect and friendly assistant. Help users build software by writing clear, well-structured code.';
        const llm2BaseWin = 'You are an expert AI code architect and friendly conversational assistant. Help users build software by writing clear, well-structured code.';

        const llm1InlineComplete = [personalityPrompt, modelFacts, systemContext].filter(Boolean).join('\n\n');
        const llm1PopupComplete = [sassyPrompt, modelFacts, systemContext].filter(Boolean).join('');
        const llm2InlineComplete = [llm2Base, modelFacts, systemContext].filter(Boolean).join('\n\n');
        const llm2WindowComplete = [llm2BaseWin, modelFacts, systemContext].filter(Boolean).join('\n\n');

        const trunc = (s: string, max: number) =>
          showFull ? s : s.length > max ? s.slice(0, max) + `\n\n\n↕ ${s.length - max} more chars (use /debug-prompt full)` : s;

        const t = showFull ? '(full)' : '(truncated)';

        const msg = [
          '🔍 **System Prompt Debug Viewer** ' + t,
          '',
          '═══ LLM 1 — Reasoning & Design (inline panel) ═══',
          '',
          `**Personality Settings**`,
          `  Sassiness: ${personality.sassiness}/100`,
          `  Warmth:    ${personality.warmth}/100`,
          `  Verbosity: ${personality.verbosity}/100`,
          `  Technical: ${personality.technical}/100`,
          `  Creativity: ${personality.creativity}/100`,
          '',
          '**Personality Base Prompt**:',
          '```',
          trunc(personalityPrompt, 600),
          '```',
          '',
          // Session Memory section removed — no longer leaks previous builds into prompts
          '',
          '**Model Facts Context**:',
          '```',
          trunc(modelFacts, 600),
          '```',
          '',
          '**System Awareness Context**:',
          '```',
          trunc(systemContext, 600),
          '```',
          '',
          '**→ Complete LLM 1 Prompt (inline)**:',
          '```',
          trunc(llm1InlineComplete, 1000),
          '```',
          '',
          '═══ LLM 1 — Popup Window ═══',
          '',
          '**Sassy Prompt Base**:',
          '```',
          trunc(sassyPrompt, 600),
          '```',
          '',
          '**→ Complete (sassy + system)**:',
          '```',
          trunc(llm1PopupComplete, 1000),
          '```',
          '',
          '═══ LLM 2 — Code Builder (inline) ═══',
          '',
          '**Base Prompt**:',
          '```',
          llm2Base,
          '```',
          '',
          '**→ Complete (base + system)**:',
          '```',
          trunc(llm2InlineComplete, 1000),
          '```',
          '',
          '═══ LLM 2 — Popup Window ═══',
          '',
          '**Base Prompt**:',
          '```',
          llm2BaseWin,
          '```',
          '',
          '**→ Complete (base + system)**:',
          '```',
          trunc(llm2WindowComplete, 1000),
          '```',
        ].join('\n');

        return { intent: null, message: msg, handled: true };
      } catch (err: any) {
        return { intent: null, message: `⚠️ Debug prompt error: ${err?.message || 'Unknown'}`, handled: true };
      } finally {
        processingRef.current = false;
      }
    }

    // ── Screenshot command ──
    if (command === 'screenshot') {
      const sub = args[0]?.toLowerCase();

      // /screenshot auto [on|off] — toggle automatic screenshot injection
      if (sub === 'auto') {
        processingRef.current = true;
        try {
          const enable = args[1]?.toLowerCase();
          let newState: boolean;
          if (enable === 'on') newState = setVisionAutoEnabled(true);
          else if (enable === 'off') newState = setVisionAutoEnabled(false);
          else newState = setVisionAutoEnabled(!isVisionAutoEnabled()); // toggle
          return {
            intent: null,
            message: newState
              ? '📸 **Auto-screenshot enabled** — LLMs will see your screen content on every message'
              : '📸 **Auto-screenshot disabled** — LLMs won\'t auto-capture your screen. Use `/screenshot describe` manually.',
            handled: true,
          };
        } catch (err: any) {
          return { intent: null, message: `⚠️ Toggle error: ${err?.message || 'Unknown'}`, handled: true };
        } finally { processingRef.current = false; }
      }

      processingRef.current = true;
      try {
        const describe = sub === 'describe';
        const prompt = describe ? args.slice(1).join(' ') : args.join(' ');

        if (describe || prompt) {
          // Describe mode: capture + analyze with vision LLM
          const result = await captureAndDescribe(prompt || undefined);
          if (result.success) {
            return {
              intent: null,
              message: `📸 **Screen Capture — Vision Analysis**\n\n${result.description}`,
              handled: true,
            };
          }
          return {
            intent: null,
            message: `⚠️ ${result.error || 'Failed to analyze screenshot'}\n\n${!result.error?.includes('no vision') ? '' : 'Configure a vision-capable model in Settings (⚙) → select a local model that supports image input.'}`,
            handled: true,
          };
        }

        // Simple capture: just show size info
        const capResult = await captureScreenshot();
        if (capResult.success && capResult.image_base64) {
          return {
            intent: null,
            message: `📸 Screenshot captured!\nSize: ${capResult.size_kb}KB (${capResult.width}x${capResult.height})\n\nUse \`/screenshot describe <prompt>\` to analyze it with a vision LLM.\nOr \`/screenshot what's on my screen?\` for a quick description.`,
            handled: true,
          };
        }
        return {
          intent: null,
          message: `⚠️ Screenshot failed: ${capResult.error || 'Unknown error'}\nMake sure the daemon is running: \`/system start\``,
          handled: true,
        };
      } catch (err: any) {
        return {
          intent: null,
          message: `⚠️ Screenshot error: ${err?.message || 'Unknown'}\nMake sure the daemon is running: \`/system start\``,
          handled: true,
        };
      } finally {
        processingRef.current = false;
      }
    }

    if (command === 'session-list') {
      processingRef.current = true;
      try {
        const sessions = await listSessions();
        if (sessions.length === 0) {
          return {
            intent: null,
            message: '📭 No saved sessions found. Use `/session-save <label>` to create one.',
            handled: true,
          };
        }
        const lines = sessions.map((s, i) =>
          `  ${i + 1}. **${s.code}** — ${s.label} (${new Date(s.createdAt).toLocaleDateString()})`
        );
        return {
          intent: null,
          message: `📋 Saved sessions:\n${lines.join('\n')}\n\nUse \`/session-load <code>\` to restore a session.`,
          handled: true,
        };
      } catch (err: any) {
        return {
          intent: null,
          message: `⚠️ Failed to list sessions: ${err?.message || 'Unknown'}`,
          handled: true,
        };
      } finally {
        processingRef.current = false;
      }
    }

    // Try to parse as a command
    const intent = parseCommandToIntent(trimmed);
    if (!intent) {
      return null; // Unrecognized /command — pass through to LLM
    }

    // Also update the Shared State Store for /set commands
    if (intent.type === 'context_set' && intent.payload.key) {
      broadcastContextUpdate({ [intent.payload.key]: intent.payload.value }, 'terminal');
    }

    // Send the intent through the IPC Bridge
    processingRef.current = true;
    try {
      const result = await sendIntentToBackend(intent);
      const message = formatIntentConfirmation(intent, result.success);
      return {
        intent,
        message,
        handled: true,
      };
    } catch (err: any) {
      return {
        intent,
        message: `⚠️ Failed to send command: ${err?.message || 'Unknown error'}`,
        handled: true,
      };
    } finally {
      processingRef.current = false;
    }
  }, []);

  return { handleCommand };
}
