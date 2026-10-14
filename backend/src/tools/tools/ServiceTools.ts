/**
 * ServiceTools — wraps existing Veronica services as ToolDef tools.
 * WebSearch, Knowledge, Emotion, Project, Blueprint, Config, TTS,
 * Sandbox, CodeGeneration, Agent, and Task tools.
 */

import type { ToolDef, ToolContext, ToolResult } from '../Tool.js';
import type { OSType } from '../../types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { guiBuilderToolDef } from './GuiBuilderTool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadLlmConfig() {
  try {
    const configPath = path.resolve(__dirname, '..', '..', '..', 'llm-config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    return {
      provider: config.primary?.provider || 'gguf',
      model: config.primary?.model || 'qwen2.5-7b-instruct-uncensored-q4_k_m.gguf',
      baseUrl: config.primary?.baseUrl || 'http://127.0.0.1:8000/v1',
    };    } catch {
    console.warn('[ServiceTools] Failed to load llm-config.json, using defaults');
    return {
      provider: 'gguf',
      model: 'qwen2.5-7b-instruct-uncensored-q4_k_m.gguf',
      baseUrl: 'http://127.0.0.1:8000/v1',
    };
  }
}

// ─── Lazy imports (loaded on first use) ─────────────────────────────────────

async function getSearchService() {
  const mod = await import('../../search/webSearch.js');
  return mod.getSearchService();
}

async function getKnowledgeStore() {
  const mod = await import('../../knowledge/knowledgeStore.js');
  return mod.knowledgeStore;
}

async function getEmotionEngine() {
  const mod = await import('../../ai/emotionEngine.js');
  return mod;
}

async function getProjectStore() {
  const mod = await import('../../db/projects.js');
  return mod.projects;
}

async function getBlueprintSuggester() {
  const mod = await import('../../blueprint/suggester.js');
  return mod;
}

async function getTTS() {
  const mod = await import('msedge-tts');
  return mod;
}

async function getTranslator() {
  const mod = await import('../../ai/translator.js');
  return mod;
}

// ─── LLM Fallback Helper ────────────────────────────────────────────────────

function isLLMConnectionError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return /econnrefused|fetch failed|connection error|connect econnrefused|ollama|translator.*error|reasoning.*failed/i.test(msg);
}

function llmFallbackResponse(toolName: string, hint: string, primaryField?: string): ToolResult<any> {
  const data: Record<string, any> = {
    _fallback: true,
    _notice: `LLM not available — ${toolName} requires a running Ollama server (ollama serve). Showing guidance instead.`,
    guidance: hint,
  };
  if (primaryField) {
    data[primaryField] = hint;
  }
  return { success: true, data };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. WebSearchTool
// ═══════════════════════════════════════════════════════════════════════════

export interface WebSearchInput {
  query: string;
  maxResults?: number;
}

const webSearchToolDef: ToolDef<WebSearchInput, { results: any[]; text: string }> = {
  name: 'web_search',
  description: 'Search the web for information using Tavily or DuckDuckGo fallback',
  category: 'web',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      maxResults: { type: 'number', description: 'Max results (default: 5)', default: 5 },
    },
    required: ['query'],
  },
  timeoutMs: 15000,

  async call(input: WebSearchInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const service = await getSearchService();
      const results = await service.search({ query: input.query, maxResults: input.maxResults || 5 });
      const text = await service.searchAsText(input.query, input.maxResults || 5);
      return { success: true, data: { results, text } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'SEARCH_ERROR' };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. KnowledgeTool
// ═══════════════════════════════════════════════════════════════════════════

export interface KnowledgeQueryInput {
  query: string;
  tags?: string[];
  nodeType?: string;
  language?: string;
  os?: string;
  maxResults?: number;
}

export interface KnowledgeAddInput {
  code: string;
  tags: string[];
  nodeType: string;
  language: string;
  targetOS: string;
  description?: string;
}

const knowledgeQueryToolDef: ToolDef<KnowledgeQueryInput, { patterns: any[]; context: string }> = {
  name: 'knowledge_query',
  description: 'Query the knowledge store for relevant code patterns',
  category: 'knowledge',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      tags: { type: 'array', description: 'Filter by tags', required: false },
      nodeType: { type: 'string', description: 'Filter by node type', required: false },
      language: { type: 'string', description: 'Filter by language', required: false },
      os: { type: 'string', description: 'Filter by target OS', required: false },
      maxResults: { type: 'number', description: 'Max results', default: 10 },
    },
    required: ['query'],
  },

  async call(input: KnowledgeQueryInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const store = await getKnowledgeStore();
      const patterns = store.query({
        tags: input.tags,
        nodeType: input.nodeType,
        language: input.language,
        targetOS: input.os,
        searchText: input.query,
      });
      // `input.query` is the caller's goal — rank the context by relevance to it.
      const context = store.getRelevantContext(input.nodeType || '', input.language || '', input.os || '', 5, input.query);
      return { success: true, data: { patterns: patterns.slice(0, input.maxResults || 10), context } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'KNOWLEDGE_ERROR' };
    }
  },
};

const knowledgeAddToolDef: ToolDef<KnowledgeAddInput, { id: string }> = {
  name: 'knowledge_add',
  description: 'Add a code pattern to the knowledge store',
  category: 'knowledge',
  riskLevel: 'medium',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Code pattern' },
      tags: { type: 'array', description: 'Tags for discovery' },
      nodeType: { type: 'string', description: 'Node type' },
      language: { type: 'string', description: 'Programming language' },
      targetOS: { type: 'string', description: 'Target OS' },
      description: { type: 'string', description: 'Optional description', required: false },
    },
    required: ['code', 'tags', 'nodeType', 'language', 'targetOS'],
  },

  async call(input: KnowledgeAddInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const store = await getKnowledgeStore();
      const entry = store.addPattern({
        category: 'code_pattern',
        title: `${input.nodeType} - ${input.language}`,
        code: input.code,
        description: input.description || '',
        tags: input.tags,
        nodeType: input.nodeType,
        language: input.language,
        targetOS: input.targetOS,
        projectId: 'tool',
        success: true,
        qualityScore: 5,
      });
      // addPattern returns null when the kill switch / quality gate rejects the
      // content — the LLM must not believe it stored a pattern it didn't.
      if (!entry) {
        return { success: false, error: 'Pattern rejected (capture disabled or content failed the quality gate)', errorCode: 'KNOWLEDGE_REJECTED' };
      }
      return { success: true, data: { id: entry.id }, didModify: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'KNOWLEDGE_ERROR' };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. EmotionTool
// ═══════════════════════════════════════════════════════════════════════════

export interface EmotionInput {
  text: string;
}

const emotionToolDef: ToolDef<EmotionInput, any> = {
  name: 'emotion_analyze',
  description: 'Analyze the emotional content of text',
  category: 'emotion',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to analyze' },
    },
    required: ['text'],
  },

  async call(input: EmotionInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const engine = await getEmotionEngine();
      const emotion = engine.analyzeEmotion(input.text);
      const context = engine.getDetailedEmotionContext(emotion);
      return { success: true, data: { emotion, context } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'EMOTION_ERROR' };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. ProjectTool
// ═══════════════════════════════════════════════════════════════════════════

export interface ProjectCreateInput {
  name?: string;
  targetOS?: string;
}

const projectListToolDef: ToolDef<void, { projects: any[] }> = {
  name: 'project_list',
  description: 'List all projects',
  category: 'project',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },

  async call(_input: void, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const store = await getProjectStore();
      const projects = store.getAll();
      return { success: true, data: { projects } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'PROJECT_ERROR' };
    }
  },
};

const projectCreateToolDef: ToolDef<ProjectCreateInput, { project: any }> = {
  name: 'project_create',
  description: 'Create a new project',
  category: 'project',
  riskLevel: 'medium',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Project name', default: 'Untitled' },
      targetOS: { type: 'string', description: 'Target OS', default: 'linux' },
    },
    required: [],
  },

  async call(input: ProjectCreateInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const store = await getProjectStore();
      const project = store.create({
        id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: input.name || 'Untitled',
        targetOS: (input.targetOS || 'linux') as OSType,
        nodes: [],
        edges: [],
      });
      return { success: true, data: { project }, didModify: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'PROJECT_ERROR' };
    }
  },
};

const projectGetToolDef: ToolDef<{ id: string }, { project: any }> = {
  name: 'project_get',
  description: 'Get a project by ID',
  category: 'project',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Project ID' },
    },
    required: ['id'],
  },

  async call(input: { id: string }, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const store = await getProjectStore();
      const project = store.getById(input.id);
      if (!project) return { success: false, error: 'Project not found', errorCode: 'NOT_FOUND' };
      return { success: true, data: { project } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'PROJECT_ERROR' };
    }
  },
};

const projectDeleteToolDef: ToolDef<{ id: string }, { deleted: boolean }> = {
  name: 'project_delete',
  description: 'Delete a project',
  category: 'project',
  riskLevel: 'high',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Project ID' },
    },
    required: ['id'],
  },

  async call(input: { id: string }, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const store = await getProjectStore();
      store.delete(input.id);
      return { success: true, data: { deleted: true }, didModify: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'PROJECT_ERROR' };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. BlueprintTool
// ═══════════════════════════════════════════════════════════════════════════

export interface BlueprintInput {
  idea: string;
  includeResearch?: boolean;
}

const blueprintToolDef: ToolDef<BlueprintInput, any> = {
  name: 'blueprint_suggest',
  description: 'Generate architectural suggestions for an app idea',
  category: 'blueprint',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {
      idea: { type: 'string', description: 'App idea description' },
      includeResearch: { type: 'boolean', description: 'Include web research', default: false },
    },
    required: ['idea'],
  },
  timeoutMs: 60000,

  async call(input: BlueprintInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const { suggestForBlueprint } = await getBlueprintSuggester();
      let searchService: any = undefined;
      if (input.includeResearch) {
        searchService = await getSearchService();
      }
      const result = await suggestForBlueprint({ goal: input.idea } as any, searchService);
      return { success: true, data: result };
    } catch (err: unknown) {
      if (isLLMConnectionError(err)) {
        return llmFallbackResponse('blueprint_suggest',
          'Blueprint generation requires LLM.\n' +
          'To design architecture manually: identify components, map data flow, choose node types, plan file structure.\n' +
          'Start Ollama with: ollama serve  (then retry this tool)');
      }
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'BLUEPRINT_ERROR' };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 6. ConfigTool
// ═══════════════════════════════════════════════════════════════════════════

export interface ConfigGetInput {
  key?: string;
}

const configGetToolDef: ToolDef<ConfigGetInput, { config: any }> = {
  name: 'config_get',
  description: 'Get current LLM configuration',
  category: 'config',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Specific config key (optional)', required: false },
    },
    required: [],
  },

  async call(_input: ConfigGetInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const config = loadLlmConfig();
      return { success: true, data: { config } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'CONFIG_ERROR' };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 7. TTSTool
// ═══════════════════════════════════════════════════════════════════════════

export interface TTSInput {
  text: string;
  voice?: string;
  pitch?: number;
  rate?: number;
}

const ttsToolDef: ToolDef<TTSInput, { audioBuffer: string; format: string }> = {
  name: 'tts_speak',
  description: 'Convert text to speech audio',
  category: 'speech',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to speak' },
      voice: { type: 'string', description: 'Voice name', default: 'en-US-JennyNeural' },
      pitch: { type: 'number', description: 'Pitch shift (Hz)', default: 0 },
      rate: { type: 'number', description: 'Speaking rate (%)', default: 0 },
    },
    required: ['text'],
  },
  timeoutMs: 30000,

  async call(input: TTSInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const { MsEdgeTTS, OUTPUT_FORMAT } = await getTTS();
      const tts = new MsEdgeTTS();
      try {
        await tts.setMetadata(input.voice || 'en-US-JennyNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

        const pitchStr = `${input.pitch ?? 0}Hz`;
        const rateStr = `${input.rate ?? 0}%`;

        const { audioStream } = tts.toStream(input.text, {
          pitch: pitchStr,
          rate: rateStr,
          volume: '+0%',
        });

        const chunks: Buffer[] = [];
        for await (const chunk of audioStream) {
          chunks.push(Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);

        return { success: true, data: { audioBuffer: buffer.toString('base64'), format: 'audio/mpeg' } };
      } finally {
        tts.close();
      }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'TTS_ERROR' };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 8. SandboxTool
// ═══════════════════════════════════════════════════════════════════════════

export interface SandboxInput {
  code: string;
  language: string;
  timeout?: number;
}

const sandboxToolDef: ToolDef<SandboxInput, { output: string; exitCode: number }> = {
  name: 'sandbox_run',
  description: 'Run code in an isolated sandbox environment using Docker',
  category: 'sandbox',
  riskLevel: 'high',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Source code to execute' },
      language: { type: 'string', description: 'Programming language (python, javascript, etc.)' },
      timeout: { type: 'number', description: 'Timeout in ms', default: 30000 },
    },
    required: ['code', 'language'],
  },
  timeoutMs: 60000,

  async call(input: SandboxInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const { SandboxRunner } = await import('../../sandbox/runner.js');
      const runner = new SandboxRunner();
      const result = await runner.run(input.code, 'linux');
      return {
        success: result.success,
        data: { output: result.output, exitCode: result.exitCode },
        error: result.errors.length > 0 ? result.errors.join('\n') : undefined,
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'SANDBOX_ERROR' };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 9. CodeGenerationTool
// ═══════════════════════════════════════════════════════════════════════════

export interface CodeGenInput {
  prompt: string;
  language: string;
  nodeType?: string;
  system?: string;
  maxTokens?: number;
}

const codeGenToolDef: ToolDef<CodeGenInput, { code: string }> = {
  name: 'code_generate',
  description: 'Generate code using the configured AI provider',
  category: 'ai',
  riskLevel: 'medium',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Prompt describing the code to generate' },
      language: { type: 'string', description: 'Target programming language' },
      nodeType: { type: 'string', description: 'Node type (input, output, logic, etc.)', required: false },
      system: { type: 'string', description: 'System prompt override', required: false },
      maxTokens: { type: 'number', description: 'Max tokens', default: 2048 },
    },
    required: ['prompt', 'language'],
  },
  timeoutMs: 120000,

  async call(input: CodeGenInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const { AITranslator } = await getTranslator();
      const translator = new AITranslator();
      const response = await translator.reason(
        input.prompt,
        input.system || `You are an expert ${input.language} developer.`,
        { maxTokens: input.maxTokens || 2048 }
      );
      return { success: true, data: { code: response } };
    } catch (err: unknown) {
      if (isLLMConnectionError(err)) {
        return llmFallbackResponse('code_generate',
          '// [LLM offline] Generate code manually. Follow project patterns.\n' +
          '// Start Ollama with: ollama serve  (then retry this tool)',
          'code');
      }
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'CODEGEN_ERROR' };
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 10. AgentTool
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentSpawnInput {
  description: string;
  prompt: string;
  model?: string;
}

interface AgentInstance {
  id: string;
  description: string;
  prompt: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  result?: string;
  error?: string;
}

const runningAgents = new Map<string, AgentInstance>();

const agentSpawnToolDef: ToolDef<AgentSpawnInput, { agentId: string; status: string }> = {
  name: 'agent_spawn',
  description: 'Spawn a sub-agent to work on a task in the background',
  category: 'agent',
  riskLevel: 'high',
  inputSchema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Description of the task' },
      prompt: { type: 'string', description: 'Detailed prompt for the agent' },
      model: { type: 'string', description: 'Model override', required: false },
    },
    required: ['description', 'prompt'],
  },
  timeoutMs: 300000,

  async call(input: AgentSpawnInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agent: AgentInstance = {
      id: agentId, description: input.description, prompt: input.prompt,
      status: 'running', startedAt: Date.now(),
    };
    runningAgents.set(agentId, agent);

    // Fire-and-forget execution using the AI translator
    (async () => {
      try {
        const { AITranslator } = await getTranslator();
        const translator = new AITranslator();
        const result = await translator.reason(
          input.prompt,
          `You are an AI agent tasked with: ${input.description}`,
          { maxTokens: 4096 }
        );
        agent.status = 'completed';
        agent.result = result;
      } catch (err: unknown) {
        agent.status = 'failed';
        agent.error = err instanceof Error ? err.message : String(err);
      }
    })();

    return { success: true, data: { agentId: agent.id, status: 'running' } };
  },
};

const agentStatusToolDef: ToolDef<{ agentId: string }, { agent: AgentInstance | null }> = {
  name: 'agent_status',
  description: 'Check the status of a spawned sub-agent',
  category: 'agent',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: { type: 'string', description: 'Agent ID from agent_spawn' },
    },
    required: ['agentId'],
  },

  async call(input: { agentId: string }, _ctx: ToolContext): Promise<ToolResult<any>> {
    const agent = runningAgents.get(input.agentId) || null;
    if (!agent) return { success: false, error: 'Agent not found', errorCode: 'NOT_FOUND' };
    return { success: true, data: { agent } };
  },
};

const agentListToolDef: ToolDef<void, { agents: AgentInstance[] }> = {
  name: 'agent_list',
  description: 'List all spawned sub-agents',
  category: 'agent',
  riskLevel: 'low',
  inputSchema: { type: 'object', properties: {}, required: [] },

  async call(_input: void, _ctx: ToolContext): Promise<ToolResult<any>> {
    return { success: true, data: { agents: Array.from(runningAgents.values()).sort((a, b) => b.startedAt - a.startedAt) } };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 11. TaskTool
// ═══════════════════════════════════════════════════════════════════════════

export interface TaskCreateInput {
  name: string;
  type: 'shell' | 'notify' | 'reminder';
  payload: Record<string, any>;
  schedule?: string;
}

interface TaskInstance {
  id: string;
  name: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  result?: string;
  error?: string;
}

const tasks = new Map<string, TaskInstance>();

const taskCreateToolDef: ToolDef<TaskCreateInput, { task: TaskInstance }> = {
  name: 'task_create',
  description: 'Create a background task',
  category: 'task',
  riskLevel: 'medium',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Task name' },
      type: { type: 'string', description: 'Task type', enum: ['shell', 'notify', 'reminder'] },
      payload: { type: 'object', description: 'Task data' },
      schedule: { type: 'string', description: 'Cron schedule expression', required: false },
    },
    required: ['name', 'type', 'payload'],
  },

  async call(input: TaskCreateInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    const task: TaskInstance = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: input.name, type: input.type, status: 'pending', createdAt: Date.now(),
    };
    tasks.set(task.id, task);

    if (input.type === 'notify') {
      task.status = 'completed';
      task.result = `Notification queued: ${input.payload.message || input.name}`;
    }

    return { success: true, data: { task }, didModify: true };
  },
};

const taskListToolDef: ToolDef<void, { tasks: TaskInstance[] }> = {
  name: 'task_list',
  description: 'List all background tasks',
  category: 'task',
  riskLevel: 'low',
  inputSchema: { type: 'object', properties: {}, required: [] },

  async call(_input: void, _ctx: ToolContext): Promise<ToolResult<any>> {
    return { success: true, data: { tasks: Array.from(tasks.values()).sort((a, b) => b.createdAt - a.createdAt) } };
  },
};

const taskCancelToolDef: ToolDef<{ taskId: string }, { cancelled: boolean }> = {
  name: 'task_cancel',
  description: 'Cancel a background task',
  category: 'task',
  riskLevel: 'medium',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task ID' },
    },
    required: ['taskId'],
  },

  async call(input: { taskId: string }, _ctx: ToolContext): Promise<ToolResult<any>> {
    const task = tasks.get(input.taskId);
    if (!task) return { success: false, error: 'Task not found', errorCode: 'NOT_FOUND' };
    task.status = 'failed';
    task.error = 'Cancelled by user';
    return { success: true, data: { cancelled: true }, didModify: true };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 12. CodeScannerTool
// ═══════════════════════════════════════════════════════════════════════════

async function getCodeScanner() {
  const mod = await import('../../scanner/CodeScanner.js')
  return mod.codeScanner
}

export interface ScanInput {
  filePath: string
  content?: string
}

const scanFileToolDef: ToolDef<ScanInput, any> = {
  name: 'code_scan',
  description: 'Scan a file for code quality issues, style problems, and potential bugs (no LLM needed)',
  category: 'utility',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path to file to scan' },
      content: { type: 'string', description: 'Optional file content (if not reading from disk)', required: false },
    },
    required: ['filePath'],
  },
  timeoutMs: 15000,
  async call(input: ScanInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const scanner = await getCodeScanner()
      const result = scanner.scanFile(input.filePath, input.content)
      return { success: true, data: result }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'SCAN_ERROR' }
    }
  },
}

export interface SecurityScanInput {
  filePath: string
  content?: string
}

const securityScanToolDef: ToolDef<SecurityScanInput, any> = {
  name: 'security_scan',
  description: 'Scan a file for security vulnerabilities (OWASP Top 10, hardcoded secrets, injection risks)',
  category: 'utility',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path to file to scan' },
      content: { type: 'string', description: 'Optional file content', required: false },
    },
    required: ['filePath'],
  },
  timeoutMs: 15000,
  async call(input: SecurityScanInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const scanner = await getCodeScanner()
      const result = scanner.securityScan(input.filePath, input.content)
      return { success: true, data: result }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'SECURITY_SCAN_ERROR' }
    }
  },
}

export interface ComplexityInput {
  source: string
}

const analyzeComplexityToolDef: ToolDef<ComplexityInput, any> = {
  name: 'analyze_complexity',
  description: 'Analyze code complexity metrics (cyclomatic complexity, nesting depth, function size)',
  category: 'utility',
  riskLevel: 'low',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Source code to analyze' },
    },
    required: ['source'],
  },
  timeoutMs: 10000,
  async call(input: ComplexityInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const scanner = await getCodeScanner()
      const result = scanner.analyzeComplexity(input.source)
      return { success: true, data: result }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'COMPLEXITY_ERROR' }
    }
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. DebugTool
// ═══════════════════════════════════════════════════════════════════════════

export interface DebugInjectInput {
  filePath: string
  expression?: string
}

const debugInjectLogsToolDef: ToolDef<DebugInjectInput, any> = {
  name: 'debug_inject_logs',
  description: 'Inject debug console.log statements into code for runtime debugging',
  category: 'utility',
  riskLevel: 'medium',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path to file to inject logs into' },
      expression: { type: 'string', description: 'Optional expression to match (injects logs near matching lines)', required: false },
    },
    required: ['filePath'],
  },
  timeoutMs: 10000,
  async call(input: DebugInjectInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const scanner = await getCodeScanner()
      const source = scanner.debugInjectLogs(input.filePath, input.expression)
      return { success: true, data: { message: 'Debug logs injected', source } }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'DEBUG_INJECT_ERROR' }
    }
  },
}

export interface DebugRemoveInput {
  filePath: string
}

const debugRemoveLogsToolDef: ToolDef<DebugRemoveInput, any> = {
  name: 'debug_remove_logs',
  description: 'Remove all injected debug console.log statements from a file',
  category: 'utility',
  riskLevel: 'medium',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path to file to clean up' },
    },
    required: ['filePath'],
  },
  timeoutMs: 10000,
  async call(input: DebugRemoveInput, _ctx: ToolContext): Promise<ToolResult<any>> {
    try {
      const scanner = await getCodeScanner()
      const result = scanner.debugRemoveLogs(input.filePath)
      return { success: true, data: result }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'DEBUG_REMOVE_ERROR' }
    }
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// Export all service tools in a single array
// ═══════════════════════════════════════════════════════════════════════════

export const serviceTools: ToolDef[] = [
  webSearchToolDef,
  knowledgeQueryToolDef,
  knowledgeAddToolDef,
  emotionToolDef,
  projectListToolDef,
  projectCreateToolDef,
  projectGetToolDef,
  projectDeleteToolDef,
  blueprintToolDef,
  configGetToolDef,
  ttsToolDef,
  sandboxToolDef,
  codeGenToolDef,
  agentSpawnToolDef,
  agentStatusToolDef,
  agentListToolDef,
  taskCreateToolDef,
  taskListToolDef,
  taskCancelToolDef,
  // GUI Builder
  guiBuilderToolDef,
  // New scanner/debug tools
  scanFileToolDef,
  securityScanToolDef,
  analyzeComplexityToolDef,
  debugInjectLogsToolDef,
  debugRemoveLogsToolDef,
] as ToolDef[];

// Named exports for individual registration
export {
  webSearchToolDef as webSearchTool,
  knowledgeQueryToolDef as knowledgeQueryTool,
  knowledgeAddToolDef as knowledgeAddTool,
  emotionToolDef as emotionTool,
  projectListToolDef as projectListTool,
  projectCreateToolDef as projectCreateTool,
  projectGetToolDef as projectGetTool,
  projectDeleteToolDef as projectDeleteTool,
  blueprintToolDef as blueprintTool,
  configGetToolDef as configGetTool,
  ttsToolDef as ttsTool,
  sandboxToolDef as sandboxTool,
  codeGenToolDef as codeGenTool,
  agentSpawnToolDef as agentSpawnTool,
  agentStatusToolDef as agentStatusTool,
  agentListToolDef as agentListTool,
  taskCreateToolDef as taskCreateTool,
  taskListToolDef as taskListTool,
  taskCancelToolDef as taskCancelTool,
  // New exports
  scanFileToolDef as codeScanTool,
  securityScanToolDef as securityScanTool,
  analyzeComplexityToolDef as analyzeComplexityTool,
  debugInjectLogsToolDef as debugInjectLogsTool,
  debugRemoveLogsToolDef as debugRemoveLogsTool,
};
