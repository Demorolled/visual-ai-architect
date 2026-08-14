import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

interface AppStatus {
  thinking: boolean;
  progress: number;
  isGenerating: boolean;
  generationLayer: number;
  projectName: string;
  targetOS: string;
  nodeCount: number;
  connected: boolean;
  timestamp: string;
}

interface GenerationProgress {
  /** 0-based batch index */
  batch: number;
  /** Total number of batches */
  totalBatches: number;
  /** Number of nodes in the current batch */
  batchSize: number;
  /** Labels of nodes currently being generated */
  generatingNodes: string[];
  /** Overall progress percentage (0-100) */
  percent: number;
  /** What phase: 'starting' | 'generating' | 'validating' | 'done' */
  phase: string;
  /** Optional human-readable status message (one-shot codegen uses this to
   *  keep the UI informed during long opaque LLM calls). */
  message?: string;
}

interface ArchitectProgress {
  /** Current phase of the architect planning process */
  phase: 'researching' | 'analyzing' | 'designing' | 'validating' | 'building' | 'done' | 'error';
  /** Human-readable description of current step */
  message: string;
  /** Progress percentage (0-100) */
  percent: number;
}

interface RemoteCommand {
  type: 'send_prompt' | 'trigger_generate' | 'trigger_clear' | 'get_status';
  payload?: any;
}

let io: Server | null = null;

/** Cache of the last broadcast tool manifest — sent to newly connecting clients */
let _lastManifest: { formattedText: string; manifest: Array<{ name: string; description: string; category: string; input_schema: Record<string, unknown> }> } | null = null;

let currentStatus: AppStatus = {
  thinking: false,
  progress: 0,
  isGenerating: false,
  generationLayer: 0,
  projectName: 'Untitled Project',
  targetOS: 'linux',
  nodeCount: 0,
  connected: false,
  timestamp: new Date().toISOString(),
};

export function getIO(): Server | null {
  return io;
}

export function getCurrentStatus(): AppStatus {
  return { ...currentStatus };
}

export function updateStatus(partial: Partial<AppStatus>): void {
  currentStatus = {
    ...currentStatus,
    ...partial,
    timestamp: new Date().toISOString(),
  };
  if (io) {
    io.emit('status_update', currentStatus);
  }
}

export function broadcastIntent(intent: any): void {
  if (io) {
    io.emit('intent', intent);
  }
}

export function broadcastGenerationProgress(progress: GenerationProgress): void {
  if (io) {
    io.emit('generation_progress', progress);
  }
}

export function broadcastArchitectProgress(progress: ArchitectProgress): void {
  if (io) {
    io.emit('architect_progress', progress);
  }
}

export function broadcastToolManifest(
  formattedText: string,
  manifest: Array<{ name: string; description: string; category: string; input_schema: Record<string, unknown> }>
): void {
  _lastManifest = { formattedText, manifest };
  if (io) {
    io.emit('tool_manifest', { formattedText, manifest });
    console.log(`[Remote] Broadcast tool manifest to all clients (${manifest.length} tools)`);
  }
}

export function initializeSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/ws',
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Remote] Client connected: ${socket.id}`);

    socket.emit('status_update', currentStatus);
    socket.emit('connected', { id: socket.id, message: 'Connected to Veronica', agentId: socket.id });

    // Send cached tool manifest if available (for clients that connect after the one-shot broadcast)
    if (_lastManifest) {
      socket.emit('tool_manifest', _lastManifest);
    }

    socket.on('command', async (command: RemoteCommand) => {
      if (command.type === 'get_status') {
        socket.emit('status_update', currentStatus);
        return;
      }

      if (command.type === 'trigger_generate') {
        updateStatus({ thinking: true, isGenerating: true });
      }

      console.log(`[Remote] Command from ${socket.id}:`, command.type);
    });

    socket.on('disconnect', () => {
      console.log(`[Remote] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[Remote] WebSocket server initialized on path /ws');
  return io;
}
