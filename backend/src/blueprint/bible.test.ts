import { describe, it, expect } from 'vitest';
import { sanitizeWiring, blueprintToProject, matchBlueprint, lexicalHitCount, validateEdgesReferentialIntegrity, type Blueprint } from './bible.js';

describe('validateEdgesReferentialIntegrity', () => {
  it('flags edges whose source or target is not a known module (dangling)', () => {
    const wiring = [
      { source_module: 'core_engine', destination_module: 'data_store', data_passed: 'x' },
      { source_module: 'ghost_module', destination_module: 'data_store', data_passed: 'x' },
      { source_module: 'core_engine', destination_module: 'nope_missing', data_passed: 'x' },
    ];
    const known = ['ui_screens', 'core_engine', 'data_store'];
    const report = validateEdgesReferentialIntegrity(wiring, known);
    expect(report.dangling.length).toBe(2);
    expect(report.dangling[0].source_module).toBe('ghost_module');
    expect(report.dangling[1].destination_module).toBe('nope_missing');
    expect(report.kept.length).toBe(1);
    expect(report.kept[0].source_module).toBe('core_engine');
  });

  it('keeps every edge intact when all endpoints resolve', () => {
    const wiring = [
      { source_module: 'ui_screens', destination_module: 'core_engine', data_passed: 'r' },
      { source_module: 'core_engine', destination_module: 'data_store', data_passed: 's' },
    ];
    const report = validateEdgesReferentialIntegrity(wiring, ['ui_screens', 'core_engine', 'data_store']);
    expect(report.dangling.length).toBe(0);
    expect(report.kept.length).toBe(2);
  });

  it('treats empty/whitespace endpoints as dangling', () => {
    const report = validateEdgesReferentialIntegrity(
      [{ source_module: '', destination_module: 'data_store', data_passed: 'x' }],
      ['data_store']
    );
    expect(report.dangling.length).toBe(1);
    expect(report.kept.length).toBe(0);
  });
});

describe('sanitizeWiring', () => {
  it('reverses UI-backwards edges (UI consumes from logic/data, never the reverse)', () => {
    const out = sanitizeWiring([
      { source_module: 'ui_screens', destination_module: 'core_engine', data_passed: 'requests' },
      { source_module: 'core_engine', destination_module: 'input_handler', data_passed: 'results' },
    ], 'test_app');
    // ui_screens → core_engine becomes core_engine → ui_screens (ui depends on engine)
    expect(out[0]).toEqual({ source_module: 'core_engine', destination_module: 'ui_screens', data_passed: 'requests' });
    // non-UI edges pass through untouched
    expect(out[1]).toEqual({ source_module: 'core_engine', destination_module: 'input_handler', data_passed: 'results' });
  });

  it('drops edges that would create a cycle', () => {
    const out = sanitizeWiring([
      { source_module: 'engine', destination_module: 'screens', data_passed: 'x' },
      { source_module: 'screens', destination_module: 'engine', data_passed: 'y' },
    ], 'test_app');
    expect(out).toHaveLength(1);
  });

  it('leaves a correct data→logic→ui flow untouched', () => {
    const out = sanitizeWiring([
      { source_module: 'data_store', destination_module: 'timer_core', data_passed: 'data' },
      { source_module: 'timer_core', destination_module: 'ui_screens', data_passed: 'ticks' },
    ], 'test_app');
    expect(out).toHaveLength(2);
    expect(out[0].source_module).toBe('data_store');
    expect(out[1].destination_module).toBe('ui_screens');
  });
});

describe('lexicalHitCount', () => {
  it('prefix-matches plural forms (recipes ≈ recipe)', () => {
    const bp: Blueprint = {
      app_type: 'recipe_manager',
      description: '',
      keywords: ['recipe', 'manager'],
      target_stack: { frontend: 'react', backend: 'node', database: 'sqlite' },
      architecture_checklist: ['ui'],
      wiring_graph: [],
    };
    expect(lexicalHitCount('organize and search my cooking recipes', bp)).toBeGreaterThanOrEqual(1);
  });

  it('ignores short common tokens like app', () => {
    const bp: Blueprint = {
      app_type: 'generic_fullstack_app',
      description: '',
      keywords: ['app'],
      target_stack: { frontend: 'react', backend: 'node', database: 'sqlite' },
      architecture_checklist: ['ui'],
      wiring_graph: [],
    };
    expect(lexicalHitCount('a simple todo app', bp)).toBe(0);
  });
});

describe('matchBlueprint (lexical-boosted, real bible data)', () => {
  it('routes a cooking/recipe goal to a cooking-domain app, not code_playground', () => {
    const goal = 'organize and search my cooking recipes with ingredients and ratings';
    const cands = matchBlueprint(goal, 5, 0.30);
    expect(cands.length).toBeGreaterThan(0);
    // Before the fix the winner was code_playground (~0.27) and the recipe
    // blueprints never entered the top-6. Now a cooking/recipe blueprint must
    // win and the unrelated playground must be gone entirely.
    expect(cands[0].blueprint.app_type).toMatch(/recipe|cooking/);
    expect(cands.some(c => c.blueprint.app_type === 'code_playground')).toBe(false);
  });

  it('prefers recipe_manager outright when the goal names it (recipe manager)', () => {
    const goal = 'a recipe manager app with ingredients and ratings';
    const cands = matchBlueprint(goal, 5, 0.30);
    expect(cands[0].blueprint.app_type).toMatch(/recipe/);
  });

  it('keeps strong semantic matches on top (pomodoro)', () => {
    const cands = matchBlueprint('a pomodoro timer with session history and stats', 3, 0.30);
    expect(cands[0].blueprint.app_type).toContain('pomodoro');
  });

  it('returns nothing below a high floor (pure weak matches fall back in the route)', () => {
    const cands = matchBlueprint('organize and search my cooking recipes with ingredients and ratings', 5, 0.9);
    expect(cands).toHaveLength(0);
  });
});

describe('blueprintToProject', () => {
  const bp: Blueprint = {
    app_type: 'pomodoro_timer_3',
    description: 'pomodoro timer',
    keywords: ['timer'],
    target_stack: { frontend: 'react', backend: 'node', database: 'sqlite' },
    architecture_checklist: ['ui_screens', 'core_engine', 'input_handler', 'data_store', 'timer_core'],
    wiring_graph: [
      { source_module: 'ui_screens', destination_module: 'core_engine', data_passed: 'requests' },
      { source_module: 'core_engine', destination_module: 'input_handler', data_passed: 'results' },
      { source_module: 'input_handler', destination_module: 'data_store', data_passed: 'state_and_events' },
      { source_module: 'data_store', destination_module: 'timer_core', data_passed: 'data' },
    ],
  };

  it('builds a DAG where the UI node depends on the engine (edge engine → ui)', () => {
    const project = blueprintToProject(bp, { goal: 'pomodoro timer' });
    const uiNode = project.nodes.find(n => n.data.label === 'ui_screens')!;
    const engineNode = project.nodes.find(n => n.data.label === 'core_engine')!;
    // edge source_module → destination_module means destination depends on source,
    // so after sanitization the edge must be engine → ui (ui depends on engine).
    const edge = project.edges.find(e => e.source === engineNode.id && e.target === uiNode.id);
    expect(edge).toBeTruthy();
  });

  it('bakes the sanitized wiring into the fused blueprint context', () => {
    const project = blueprintToProject(bp, { goal: 'pomodoro timer' });
    const master = project.nodes.find(n => n.type === 'master')!;
    const ctx = master.data.blueprintContext as string;
    expect(ctx).toContain('core_engine → ui_screens');
    expect(ctx).not.toContain('ui_screens → core_engine');
  });

  it('creates one node per checklist module plus the master', () => {
    const project = blueprintToProject(bp, { goal: 'pomodoro timer' });
    expect(project.nodes).toHaveLength(bp.architecture_checklist.length + 1);
  });
});
