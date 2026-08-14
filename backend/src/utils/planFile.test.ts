import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readdirSync, unlinkSync, rmSync } from 'fs';

const TMP_DIR = '/tmp/vaca-plans-test';

type PlanFileModule = typeof import('./planFile.js');

describe('planFile', () => {
  let pf: PlanFileModule;

  beforeEach(async () => {
    rmSync(TMP_DIR, { recursive: true, force: true });
    process.env.VACA_PLANS_DIR = TMP_DIR;
    vi.resetModules();
    pf = await import('./planFile.js');
  });

  afterEach(() => {
    delete process.env.VACA_PLANS_DIR;
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('safePlanName strips unsafe chars and spaces', () => {
    expect(pf.safePlanName('My App!')).toBe('My_App');
    expect(pf.safePlanName('Weather  Dashboard')).toBe('Weather_Dashboard');
    expect(pf.safePlanName('!!!')).toBe('untitled-plan');
    expect(pf.safePlanName('  ')).toBe('untitled-plan');
  });

  it('formatPlanFile produces a complete plan text file', () => {
    const text = pf.formatPlanFile({
      projectName: 'Todo App',
      ideas: 'Build a todo app with streaks.',
      guidance: 'Start with a list view.',
      questions: 'Mobile or desktop?',
      updatedAt: '2026-08-03T00:00:00.000Z',
    });
    expect(text).toContain('PLAN: Todo App');
    expect(text).toContain('Status: PLANNED');
    expect(text).toContain('Build a todo app with streaks.');
    expect(text).toContain('Start with a list view.');
    expect(text).toContain('Mobile or desktop?');
    expect(text).toContain('Auto-saved by VACA Plan Mode');
  });

  it('savePlanFile writes to the plans dir and returns a record', () => {
    const rec = pf.savePlanFile({
      projectName: 'Weather Dashboard',
      ideas: 'Show forecasts from an API.',
    });
    expect(rec.fileName).toBe('Weather_Dashboard.txt');
    expect(rec.filePath).toContain(TMP_DIR);
    expect(existsSync(rec.filePath)).toBe(true);
    expect(rec.projectName).toBe('Weather Dashboard');
  });

  it('listPlanFiles finds saved plans', () => {
    pf.savePlanFile({ projectName: 'Alpha App', ideas: 'a' });
    pf.savePlanFile({ projectName: 'Beta App', ideas: 'b' });
    const plans = pf.listPlanFiles();
    expect(plans.length).toBe(2);
    expect(plans.some(p => p.fileName === 'Alpha_App.txt')).toBe(true);
    expect(plans.some(p => p.fileName === 'Beta_App.txt')).toBe(true);
  });

  it('readPlanFile returns content by name', () => {
    pf.savePlanFile({ projectName: 'My Plan', ideas: 'The idea!' });
    const read = pf.readPlanFile('My Plan');
    expect(read).not.toBeNull();
    expect(read!.content).toContain('The idea!');
    expect(pf.readPlanFile('Does Not Exist')).toBeNull();
  });

  it('saving the same name updates the same file', () => {
    pf.savePlanFile({ projectName: 'Same', ideas: 'v1' });
    pf.savePlanFile({ projectName: 'Same', ideas: 'v2' });
    const files = readdirSync(TMP_DIR).filter(f => f.endsWith('.txt'));
    expect(files.length).toBe(1);
    const read = pf.readPlanFile('Same');
    expect(read!.content).toContain('v2');
  });
});
