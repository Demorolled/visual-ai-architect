import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Node, Edge } from 'reactflow';
import type { SavedProject } from '../store/projectStore';

// ─── Mock external dependencies ────────────────────────────────────

// Mock projectStorage
vi.mock('../utils/projectStorage', () => ({
  saveProject: vi.fn((p: any) => ({
    id: p.id,
    name: p.name,
    targetOS: p.targetOS,
    nodes: p.nodes,
    edges: p.edges,
    savedAt: new Date().toISOString(),
    version: 1,
  })),
  loadProject: vi.fn((_id: string): SavedProject | null => null),
  loadProjects: vi.fn((): SavedProject[] => []),
  deleteProject: vi.fn((): boolean => true),
  exportProject: vi.fn((): string | null => null),
  importProject: vi.fn((): SavedProject | null => null),
  SavedProject: {} as any,
}));

// Mock autoSave
vi.mock('../utils/autoSave', () => ({
  performAutoSave: vi.fn(),
}));

// ─── Import the store under test ───────────────────────────────────

import { useProjectStore, getNextNodeId } from '../store/projectStore';

// ─── Helpers ───────────────────────────────────────────────────────

function makeNode(id: string, type = 'logic', label = 'Test'): Node {
  return {
    id,
    type,
    position: { x: 100, y: 200 },
    data: { label, type, status: 'pending' as const },
  };
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target, type: 'default' };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('projectStore', () => {
  // Reset store before each test
  beforeEach(() => {
    useProjectStore.getState().clearProject();
  });

  // ─── Initial State ──────────────────────────────────────────────

  describe('initial state', () => {
    it('should start with default values', () => {
      const state = useProjectStore.getState();
      expect(state.projectName).toBe('Untitled Project');
      expect(state.targetOS).toBe('linux');
      expect(state.nodes).toEqual([]);
      expect(state.edges).toEqual([]);
      expect(state.selectedNode).toBeNull();
      expect(state.isGenerating).toBe(false);
      expect(state.generationLayer).toBe(0);
      expect(state.wizardStep).toBe('welcome');
      expect(state.userGoal).toBe('');
      expect(state.userPurpose).toBe('');
      expect(state.saved).toBe(true);
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(false);
    });
  });

  // ─── Node Operations ────────────────────────────────────────────

  describe('addNode', () => {
    it('should add a node', () => {
      const node = makeNode('node_1');
      useProjectStore.getState().addNode(node);
      const nodes = useProjectStore.getState().nodes;
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('node_1');
    });

    it('should enable undo after adding', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      expect(useProjectStore.getState().canUndo).toBe(true);
    });

    it('should mark project as unsaved', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      expect(useProjectStore.getState().saved).toBe(false);
    });
  });

  describe('updateNode', () => {
    it('should update node data', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().updateNode('node_1', { description: 'Updated desc' });
      const node = useProjectStore.getState().nodes[0];
      expect(node.data.description).toBe('Updated desc');
      expect(node.data.label).toBe('Test'); // unchanged
    });
  });

  describe('updateNodePosition', () => {
    it('should update node position', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().updateNodePosition('node_1', { x: 500, y: 600 });
      const node = useProjectStore.getState().nodes[0];
      expect(node.position).toEqual({ x: 500, y: 600 });
    });
  });

  describe('updateNodeStatus', () => {
    it('should update node status and optional code', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().updateNodeStatus('node_1', 'valid', undefined, 'console.log("hello")');
      const node = useProjectStore.getState().nodes[0];
      expect(node.data.status).toBe('valid');
      expect(node.data.generatedCode).toBe('console.log("hello")');
    });
  });

  describe('setNodeLanguage', () => {
    it('should set the language on a node', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().setNodeLanguage('node_1', 'python');
      const node = useProjectStore.getState().nodes[0];
      expect(node.data.language).toBe('python');
    });
  });

  describe('toggleNodeExpanded', () => {
    it('should toggle expanded state', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      expect(useProjectStore.getState().nodes[0].data.expanded).toBeUndefined();
      useProjectStore.getState().toggleNodeExpanded('node_1');
      expect(useProjectStore.getState().nodes[0].data.expanded).toBe(true);
      useProjectStore.getState().toggleNodeExpanded('node_1');
      expect(useProjectStore.getState().nodes[0].data.expanded).toBe(false);
    });
  });

  describe('deleteNode', () => {
    it('should delete a node and its edges', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().addNode(makeNode('node_2'));
      useProjectStore.getState().addEdge(makeEdge('edge_1', 'node_1', 'node_2'));
      useProjectStore.getState().deleteNode('node_1');
      expect(useProjectStore.getState().nodes).toHaveLength(1);
      expect(useProjectStore.getState().edges).toHaveLength(0);
    });
  });

  // ─── Edge Operations ────────────────────────────────────────────

  describe('addEdge', () => {
    it('should add an edge', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().addNode(makeNode('node_2'));
      useProjectStore.getState().addEdge(makeEdge('edge_1', 'node_1', 'node_2'));
      expect(useProjectStore.getState().edges).toHaveLength(1);
    });
  });

  describe('removeEdge', () => {
    it('should remove an edge', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().addNode(makeNode('node_2'));
      useProjectStore.getState().addEdge(makeEdge('edge_1', 'node_1', 'node_2'));
      useProjectStore.getState().removeEdge('edge_1');
      expect(useProjectStore.getState().edges).toHaveLength(0);
    });
  });

  // ─── Batch Operations ───────────────────────────────────────────

  describe('batchAddNodes', () => {
    it('should add multiple nodes and edges at once', () => {
      const nodes = [makeNode('node_1'), makeNode('node_2')];
      const edges = [makeEdge('edge_1', 'node_1', 'node_2')];
      useProjectStore.getState().batchAddNodes(nodes, edges, 'mac');
      expect(useProjectStore.getState().nodes).toHaveLength(2);
      expect(useProjectStore.getState().edges).toHaveLength(1);
      expect(useProjectStore.getState().targetOS).toBe('mac');
    });
  });

  describe('replaceNodes', () => {
    it('should replace all non-master nodes and edges', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().addNode(makeNode('node_2'));
      const newNodes = [makeNode('node_3'), makeNode('node_4')];
      const newEdges = [makeEdge('edge_new', 'node_3', 'node_4')];
      useProjectStore.getState().replaceNodes(newNodes, newEdges, 'windows');
      expect(useProjectStore.getState().nodes).toHaveLength(2);
      expect(useProjectStore.getState().nodes[0].id).toBe('node_3');
      expect(useProjectStore.getState().edges).toHaveLength(1);
    });

    it('should keep master node when masterNodeId is provided', () => {
      useProjectStore.getState().addNode({ ...makeNode('master-node'), type: 'master' });
      useProjectStore.getState().addNode(makeNode('node_1'));
      const newNodes = [makeNode('node_2')];
      useProjectStore.getState().replaceNodes(newNodes, [], 'linux', 'master-node');
      const ids = useProjectStore.getState().nodes.map(n => n.id);
      expect(ids).toContain('master-node');
      expect(ids).toContain('node_2');
      expect(ids).not.toContain('node_1');
    });
  });

  // ─── Undo / Redo ────────────────────────────────────────────────

  describe('undo/redo', () => {
    it('should undo a node add', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      expect(useProjectStore.getState().nodes).toHaveLength(1);
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().nodes).toHaveLength(0);
    });

    it('should redo a node add after undo', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().nodes).toHaveLength(0);
      useProjectStore.getState().redo();
      expect(useProjectStore.getState().nodes).toHaveLength(1);
    });

    it('should not undo if no history', () => {
      const before = useProjectStore.getState().nodes.length;
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().nodes.length).toBe(before);
    });

    it('should clear redo stack on new action', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().canRedo).toBe(true);
      useProjectStore.getState().addNode(makeNode('node_2'));
      expect(useProjectStore.getState().canRedo).toBe(false);
    });

    it('should undo updateNode', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().updateNode('node_1', { description: 'v2' });
      expect(useProjectStore.getState().nodes[0].data.description).toBe('v2');
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().nodes[0].data.description).toBeUndefined();
    });

    it('should undo deleteNode', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().addNode(makeNode('node_2'));
      useProjectStore.getState().deleteNode('node_1');
      expect(useProjectStore.getState().nodes).toHaveLength(1);
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().nodes).toHaveLength(2);
    });

    it('should cap undo stack at MAX_HISTORY', () => {
      // Add 60 nodes — only the last 50 should be in undo stack
      for (let i = 0; i < 60; i++) {
        useProjectStore.getState().addNode(makeNode(`node_${i}`));
      }
      // Undo 55 times — should only be able to undo 50 times
      for (let i = 0; i < 55; i++) {
        useProjectStore.getState().undo();
      }
      expect(useProjectStore.getState().canUndo).toBe(false);
      expect(useProjectStore.getState().nodes.length).toBe(10); // 60 - 50 = 10 remaining
    });
  });

  // ─── Workflow State ─────────────────────────────────────────────

  describe('workflow state', () => {
    it('should set wizard step', () => {
      useProjectStore.getState().setWizardStep('code-gen');
      expect(useProjectStore.getState().wizardStep).toBe('code-gen');
    });

    it('should set user goal', () => {
      useProjectStore.getState().setUserGoal('Build a todo app');
      expect(useProjectStore.getState().userGoal).toBe('Build a todo app');
    });

    it('should set user purpose', () => {
      useProjectStore.getState().setUserPurpose('For managing tasks');
      expect(useProjectStore.getState().userPurpose).toBe('For managing tasks');
    });

    it('should set project name', () => {
      useProjectStore.getState().setProjectName('My App');
      expect(useProjectStore.getState().projectName).toBe('My App');
      expect(useProjectStore.getState().saved).toBe(false);
    });

    it('should mark as saved', () => {
      useProjectStore.getState().markSaved();
      expect(useProjectStore.getState().saved).toBe(true);
    });
  });

  // ─── Generation State ───────────────────────────────────────────

  describe('generation state', () => {
    it('should set generating and thinking', () => {
      useProjectStore.getState().setGenerating(true);
      expect(useProjectStore.getState().isGenerating).toBe(true);
      expect(useProjectStore.getState().thinking).toBe(true);
    });

    it('should reset progress when generation completes', () => {
      useProjectStore.getState().setProgress(50);
      useProjectStore.getState().setGenerating(false);
      expect(useProjectStore.getState().isGenerating).toBe(false);
      expect(useProjectStore.getState().progress).toBe(100);
    });

    it('should set generation layer and progress', () => {
      useProjectStore.getState().setGenerationLayer(2);
      expect(useProjectStore.getState().generationLayer).toBe(2);
      expect(useProjectStore.getState().progress).toBe(66); // min(2 * 33, 99)
    });

    it('should clamp progress between 0 and 100', () => {
      useProjectStore.getState().setProgress(150);
      expect(useProjectStore.getState().progress).toBe(100);
      useProjectStore.getState().setProgress(-10);
      expect(useProjectStore.getState().progress).toBe(0);
    });

    it('should set thinking state', () => {
      useProjectStore.getState().setThinking(true);
      expect(useProjectStore.getState().thinking).toBe(true);
    });
  });

  // ─── Sub-Node Operations ────────────────────────────────────────

  describe('sub-nodes', () => {
    it('should add a sub-node to a parent node', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      const subNode = {
        id: 'sub_1',
        label: 'Sub Task',
        description: 'A subtask',
        type: 'logic' as const,
        status: 'pending' as const,
        position: { x: 0, y: 0 },
      };
      useProjectStore.getState().addSubNode('node_1', subNode);
      const parent = useProjectStore.getState().nodes[0];
      expect(parent.data.subNodes).toHaveLength(1);
      expect(parent.data.subNodes![0].label).toBe('Sub Task');
    });

    it('should update a sub-node', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().addSubNode('node_1', {
        id: 'sub_1', label: 'Old', description: '', type: 'logic',
        status: 'pending', position: { x: 0, y: 0 },
      });
      useProjectStore.getState().updateSubNode('node_1', 'sub_1', { label: 'New Name' });
      const parent = useProjectStore.getState().nodes[0];
      expect(parent.data.subNodes![0].label).toBe('New Name');
    });

    it('should delete a sub-node and its edges', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().addSubNode('node_1', {
        id: 'sub_1', label: 'A', description: '', type: 'logic',
        status: 'pending', position: { x: 0, y: 0 },
      });
      useProjectStore.getState().addSubNodeEdge('node_1', {
        id: 'edge_1', source: 'sub_1', target: 'sub_2',
      });
      useProjectStore.getState().deleteSubNode('node_1', 'sub_1');
      const parent = useProjectStore.getState().nodes[0];
      expect(parent.data.subNodes).toHaveLength(0);
      expect(parent.data.subNodeEdges).toHaveLength(0);
    });
  });

  // ─── Target OS ──────────────────────────────────────────────────

  describe('setTargetOS', () => {
    it('should set the target OS', () => {
      useProjectStore.getState().setTargetOS('ios');
      expect(useProjectStore.getState().targetOS).toBe('ios');
      expect(useProjectStore.getState().saved).toBe(false);
    });
  });

  // ─── Detached Panels ────────────────────────────────────────────

  describe('panel detachment', () => {
    it('should set roadmap detached', () => {
      useProjectStore.getState().setRoadmapDetached(true);
      expect(useProjectStore.getState().roadmapDetached).toBe(true);
    });

    it('should set reasoning detached', () => {
      useProjectStore.getState().setReasoningDetached(true);
      expect(useProjectStore.getState().reasoningDetached).toBe(true);
    });
  });

  // ─── getNextNodeId helper ───────────────────────────────────────

  describe('getNextNodeId', () => {
    it('should generate sequential node IDs', () => {
      expect(getNextNodeId()).toBe('node_0');
      expect(getNextNodeId()).toBe('node_1');
      expect(getNextNodeId()).toBe('node_2');
    });
  });

  // ─── Clear Project ──────────────────────────────────────────────

  describe('clearProject', () => {
    it('should reset all state to defaults', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().setProjectName('Test');
      useProjectStore.getState().setTargetOS('windows');
      useProjectStore.getState().setUserGoal('Goal');
      useProjectStore.getState().clearProject();
      const state = useProjectStore.getState();
      expect(state.nodes).toEqual([]);
      expect(state.projectName).toBe('Untitled Project');
      expect(state.targetOS).toBe('linux');
      expect(state.userGoal).toBe('');
      expect(state.isGenerating).toBe(false);
      expect(state.canUndo).toBe(false);
    });
  });

  // ─── Multiple Nodes ─────────────────────────────────────────────

  describe('multiple node operations', () => {
    it('should manage multiple nodes independently', () => {
      useProjectStore.getState().addNode(makeNode('node_1'));
      useProjectStore.getState().addNode(makeNode('node_2'));
      useProjectStore.getState().updateNode('node_1', { description: 'First' });
      useProjectStore.getState().updateNode('node_2', { description: 'Second' });
      const nodes = useProjectStore.getState().nodes;
      expect(nodes[0].data.description).toBe('First');
      expect(nodes[1].data.description).toBe('Second');
    });
  });

  // ─── Preview requests (chat "show me a preview" → mockup fallback) ──

  describe('preview request', () => {
    it('bumps the token and carries the goal', () => {
      const before = useProjectStore.getState().previewRequestToken;
      useProjectStore.getState().requestPreview('build me a chess app');
      const state = useProjectStore.getState();
      expect(state.previewRequestToken).toBe(before + 1);
      expect(state.previewRequestGoal).toBe('build me a chess app');
    });

    it('resets the goal when a request carries none', () => {
      useProjectStore.getState().requestPreview('old goal');
      useProjectStore.getState().requestPreview();
      expect(useProjectStore.getState().previewRequestGoal).toBeNull();
    });
  });

  // ─── Blueprint build requests (mockup "⚡ Build This Now") ──────

  describe('blueprint build request', () => {
    it('stores the goal + purpose and bumps the token', () => {
      const before = useProjectStore.getState().blueprintRequestToken;
      useProjectStore.getState().requestBlueprintBuild('a pomodoro timer', 'track focus sessions');
      const state = useProjectStore.getState();
      expect(state.blueprintRequestToken).toBe(before + 1);
      expect(state.blueprintRequestGoal).toBe('a pomodoro timer');
      expect(state.blueprintRequestPurpose).toBe('track focus sessions');
    });

    it('clearBlueprintRequest resets everything', () => {
      useProjectStore.getState().requestBlueprintBuild('a pomodoro timer', 'track focus sessions');
      useProjectStore.getState().clearBlueprintRequest();
      const state = useProjectStore.getState();
      expect(state.blueprintRequestToken).toBe(0);
      expect(state.blueprintRequestGoal).toBeNull();
      expect(state.blueprintRequestPurpose).toBeNull();
    });
  });

  // ─── Settings open requests (preview toast → Auto GUI Preview toggle) ──

  describe('settings open request', () => {
    it('bumps the token on each request', () => {
      const before = useProjectStore.getState().settingsOpenToken;
      useProjectStore.getState().requestOpenSettings();
      expect(useProjectStore.getState().settingsOpenToken).toBe(before + 1);
    });
  });

  // ─── Session-history requests (chat "show me the session history") ──────

  describe('session history request', () => {
    it('bumps the token on each request', () => {
      const before = useProjectStore.getState().sessionHistoryRequestToken;
      useProjectStore.getState().requestSessionHistory();
      expect(useProjectStore.getState().sessionHistoryRequestToken).toBe(before + 1);
    });
  });

  // ─── Wiki requests (chat "show your wiki") ──────────────────────────────

  describe('wiki request', () => {
    it('bumps the token on each request', () => {
      const before = useProjectStore.getState().wikiRequestToken;
      useProjectStore.getState().requestWiki();
      expect(useProjectStore.getState().wikiRequestToken).toBe(before + 1);
    });
  });

  // ─── Todo requests (chat "open the todo list") ──────────────────────────

  describe('todo request', () => {
    it('bumps the token on each request', () => {
      const before = useProjectStore.getState().todoRequestToken;
      useProjectStore.getState().requestTodo();
      expect(useProjectStore.getState().todoRequestToken).toBe(before + 1);
    });
  });

  // ═══ Big Plan Mode: reload a saved design ═══════════════════════════════
  //
  // The design is autosaved to data/plans/<name>/graph.json and this is the way
  // back. The round trip is lossy in exactly one dangerous direction: if a
  // reload drops something, the NEXT autosave writes that loss to disk, so the
  // answers the user typed are gone for good.

  describe('loadPlanDesign', () => {
    const SAVED = {
      projectName: 'Note Taking App',
      goal: 'A desktop note-taking app with encrypted storage',
      nodes: [
        {
          id: 'node_1',
          type: 'logic',
          label: 'Notes Core',
          description: 'holds notes, exposes CRUD',
          language: 'typescript',
          isMaster: true,
          qa: [
            {
              q: 'What data does the Notes Core store besides the notes?',
              a: 'Only notes and their tags.',
              at: '2026-09-15T02:30:00.000Z',
            },
          ],
        },
        { id: 'node_3', type: 'database', label: 'Encrypted Store', language: 'rust' },
      ],
      edges: [{ source: 'node_3', target: 'node_1', label: 'persists notes' }],
    };

    it('restores the nodes and wiring onto the canvas', () => {
      useProjectStore.getState().loadPlanDesign(SAVED);
      const state = useProjectStore.getState();

      expect(state.nodes.map((n) => n.id)).toEqual(['node_1', 'node_3']);
      expect(state.edges).toHaveLength(1);
      expect(state.edges[0].source).toBe('node_3');
      expect(state.edges[0].target).toBe('node_1');
      expect(state.edges[0].label).toBe('persists notes');

      const core = state.nodes.find((n) => n.id === 'node_1')!;
      expect(core.type).toBe('logic');
      expect(core.data.label).toBe('Notes Core');
      expect(core.data.description).toBe('holds notes, exposes CRUD');
      expect(core.data.language).toBe('typescript');
    });

    it('restores the co-worker answers attached to their nodes', () => {
      useProjectStore.getState().loadPlanDesign(SAVED);
      const core = useProjectStore.getState().nodes.find((n) => n.id === 'node_1')!;

      // Dropping these is the silent data-loss bug: the answers exist in
      // graph.json, and the first autosave after a lossy reload would erase
      // them from disk for good.
      expect(core.data.planQa).toHaveLength(1);
      expect(core.data.planQa![0].q).toContain('What data does the Notes Core store');
      expect(core.data.planQa![0].a).toBe('Only notes and their tags.');

      // A node that was never asked about stays clean.
      const store = useProjectStore.getState().nodes.find((n) => n.id === 'node_3')!;
      expect(store.data.planQa).toBeUndefined();
    });

    it('re-enters Plan Mode and restores the goal and seed', () => {
      useProjectStore.getState().setPlanMode(false);
      useProjectStore.getState().loadPlanDesign(SAVED);
      const state = useProjectStore.getState();

      expect(state.planMode).toBe(true);
      expect(state.planSeedId).toBe('node_1');
      expect(state.projectName).toBe('Note Taking App');
      expect(state.userGoal).toBe('A desktop note-taking app with encrypted storage');
    });

    it('keeps the app\'s own master-node blueprint node', () => {
      useProjectStore.getState().addNode(makeNode('master-node', 'master', 'App Blueprint'));
      useProjectStore.getState().loadPlanDesign(SAVED);
      expect(useProjectStore.getState().nodes.some((n) => n.id === 'master-node')).toBe(true);
    });

    it('lays the design out instead of stacking every node on one spot', () => {
      useProjectStore.getState().loadPlanDesign(SAVED);
      const [a, b] = useProjectStore.getState().nodes;
      // graph.json stores meaning, not drag positions — so the reload must
      // place them somewhere sensible (and not all at the same point).
      expect(a.position).toBeTruthy();
      expect(a.position).not.toEqual(b.position);
    });

    it('falls back for a node type or language it does not recognise', () => {
      useProjectStore.getState().loadPlanDesign({
        projectName: 'Odd',
        goal: '',
        nodes: [
          { id: 'weird_1', type: 'not-a-real-type', label: 'Mystery', language: 'brainfuck' },
        ],
        edges: [],
      });
      const n = useProjectStore.getState().nodes[0];
      expect(n.type).toBe('logic');
      expect(n.data.type).toBe('logic');
      expect(n.data.language).toBeUndefined();
    });

    it('bumps the node-id counter so a new node cannot collide with a loaded one', () => {
      // Ids were minted in an earlier session; the counter starts at 0 again.
      useProjectStore.getState().loadPlanDesign(SAVED);
      const fresh = getNextNodeId();
      expect(useProjectStore.getState().nodes.some((n) => n.id === fresh)).toBe(false);
    });

    it('is undoable', () => {
      useProjectStore.getState().addNode(makeNode('node_99'));
      useProjectStore.getState().loadPlanDesign(SAVED);
      expect(useProjectStore.getState().canUndo).toBe(true);
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().nodes.map((n) => n.id)).toEqual(['node_99']);
    });
  });

  // ═══ Big Plan Mode: attaching answers to nodes ══════════════════════════

  describe('planQuestions / answerPlanQuestion', () => {
    function askNode(nodeId: string | null, nodeLabel: string | null, text: string) {
      useProjectStore.getState().setPlanQuestions([
        { id: 'q1', text, nodeId, nodeLabel, at: '2026-09-15T02:30:00.000Z' },
      ]);
    }

    it('holds the open questions', () => {
      askNode('node_1', 'Notes Core', 'What does this node own?');
      expect(useProjectStore.getState().planQuestions).toHaveLength(1);
      expect(useProjectStore.getState().planQuestions[0].text).toBe('What does this node own?');
    });

    it('attaches the answer to the node the question was about, and closes it', () => {
      useProjectStore.getState().addNode(makeNode('node_1', 'logic', 'Notes Core'));
      useProjectStore.getState().addNode(makeNode('node_2', 'ui', 'Editor View'));
      askNode('node_2', 'Editor View', 'Does this render markdown itself?');

      useProjectStore.getState().answerPlanQuestion('q1', '  Yes, it renders markdown.  ');

      const state = useProjectStore.getState();
      expect(state.planQuestions).toHaveLength(0);

      const target = state.nodes.find((n) => n.id === 'node_2')!;
      expect(target.data.planQa).toHaveLength(1);
      expect(target.data.planQa![0].q).toBe('Does this render markdown itself?');
      expect(target.data.planQa![0].a).toBe('Yes, it renders markdown.'); // trimmed

      // The node the question was NOT about is untouched: answers are attached,
      // not dumped on the first node or on the project.
      const other = state.nodes.find((n) => n.id === 'node_1')!;
      expect(other.data.planQa).toBeUndefined();
    });

    it('files a design-wide question on the seed node rather than losing it', () => {
      useProjectStore.getState().addNode(makeNode('node_1', 'logic', 'Notes Core'));
      useProjectStore.getState().setPlanSeedId('node_1');
      askNode(null, null, 'Should this ship as a single window or multi-document?');

      useProjectStore.getState().answerPlanQuestion('q1', 'Single window to start.');

      const seed = useProjectStore.getState().nodes.find((n) => n.id === 'node_1')!;
      expect(seed.data.planQa).toHaveLength(1);
      expect(seed.data.planQa![0].a).toBe('Single window to start.');
    });

    it('ignores an empty answer instead of writing a blank one', () => {
      useProjectStore.getState().addNode(makeNode('node_1', 'logic', 'Notes Core'));
      askNode('node_1', 'Notes Core', 'Anything?');

      useProjectStore.getState().answerPlanQuestion('q1', '   ');

      const state = useProjectStore.getState();
      expect(state.planQuestions).toHaveLength(1); // still open
      expect(state.nodes[0].data.planQa).toBeUndefined();
    });

    it('appends to answers already on the node', () => {
      const node = makeNode('node_1', 'logic', 'Notes Core');
      node.data.planQa = [{ q: 'First?', a: 'One.', at: '2026-09-15T01:00:00.000Z' }];
      useProjectStore.getState().addNode(node);
      askNode('node_1', 'Notes Core', 'Second?');

      useProjectStore.getState().answerPlanQuestion('q1', 'Two.');

      expect(useProjectStore.getState().nodes[0].data.planQa).toHaveLength(2);
      expect(useProjectStore.getState().nodes[0].data.planQa![1].a).toBe('Two.');
    });

    it('dismissPlanQuestion closes a question without attaching anything', () => {
      useProjectStore.getState().addNode(makeNode('node_1', 'logic', 'Notes Core'));
      askNode('node_1', 'Notes Core', 'Never mind?');

      useProjectStore.getState().dismissPlanQuestion('q1');

      const state = useProjectStore.getState();
      expect(state.planQuestions).toHaveLength(0);
      expect(state.nodes[0].data.planQa).toBeUndefined();
    });

    it('survives a reload of the design it was answered in', () => {
      // The full loop: answer on the canvas → saved → reopened → still there.
      useProjectStore.getState().loadPlanDesign({
        projectName: 'Loop',
        goal: 'g',
        nodes: [{ id: 'node_1', type: 'logic', label: 'Notes Core', isMaster: true }],
        edges: [],
      });
      useProjectStore.getState().setPlanQuestions([
        { id: 'q1', text: 'Who owns the file?', nodeId: 'node_1', nodeLabel: 'Notes Core', at: 't' },
      ]);
      useProjectStore.getState().answerPlanQuestion('q1', 'The store does.');

      const saved = useProjectStore.getState().nodes.map((n) => ({
        id: n.id,
        type: (n.data as any).type || n.type,
        label: n.data.label,
        qa: (n.data as any).planQa || [],
        isMaster: true,
      }));

      useProjectStore.getState().clearProject();
      useProjectStore.getState().loadPlanDesign({ projectName: 'Loop', goal: 'g', nodes: saved as any, edges: [] });

      const back = useProjectStore.getState().nodes[0];
      expect(back.data.planQa).toHaveLength(1);
      expect(back.data.planQa![0].a).toBe('The store does.');
    });
  });
});
