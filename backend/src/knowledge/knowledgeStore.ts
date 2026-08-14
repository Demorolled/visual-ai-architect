import * as fs from 'fs';
import * as path from 'path';
import { PatternEntry, KnowledgeQuery, KNOWLEDGE_DIR } from './knowledgeTypes.js';
import { isQualityCode, isAutoLearnDisabled } from './qualityGate.js';

class KnowledgeStore {
  private patterns: PatternEntry[] = [];
  private currentSheet: number = 1;
  private sheetMetaPath: string = '';
  private isArchiving: boolean = false;
  private isBatchLoading: boolean = false;
  static readonly SHEET_CAP = 100;
  private filePath: string;

  constructor() {
    const baseDir = path.join(process.cwd(), KNOWLEDGE_DIR);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.filePath = path.join(baseDir, 'patterns.json');
    this.load();
    this.sheetMetaPath = path.join(baseDir, 'sheet-meta.json');
    this.loadSheetMeta();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        this.patterns = JSON.parse(data);
        console.log(`[knowledge] Loaded ${this.patterns.length} patterns`);
      }
    } catch (err) {
      console.error('[knowledge] Error loading patterns:', err);
      this.patterns = [];
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.patterns, null, 2), 'utf-8');
    } catch (err) {
      console.error('[knowledge] Error saving patterns:', err);
    }
  }

  private saveSheetMeta(): void {
    try {
      if (!this.sheetMetaPath) return;
      const dir = path.dirname(this.sheetMetaPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.sheetMetaPath, JSON.stringify({ currentSheet: this.currentSheet }, null, 2), 'utf-8');
    } catch {}
  }

  private loadSheetMeta(): void {
    try {
      if (this.sheetMetaPath && fs.existsSync(this.sheetMetaPath)) {
        const data = JSON.parse(fs.readFileSync(this.sheetMetaPath, 'utf-8'));
        this.currentSheet = data.currentSheet || 1;
        console.log(`[knowledge] Sheet #${this.currentSheet} (${this.count()}/${KnowledgeStore.SHEET_CAP} patterns)`);
      }
    } catch {
      this.currentSheet = 1;
    }
  }

  getAll(): PatternEntry[] {
    return [...this.patterns];
  }

  getById(id: string): PatternEntry | undefined {
    return this.patterns.find(p => p.id === id);
  }

  query(query: KnowledgeQuery): PatternEntry[] {
    let results = [...this.patterns];

    if (query.tags && query.tags.length > 0) {
      results = results.filter(p =>
        query.tags!.some(tag => p.tags.includes(tag))
      );
    }

    if (query.nodeType) {
      results = results.filter(p => p.nodeType === query.nodeType);
    }

    if (query.language) {
      results = results.filter(p => p.language === query.language);
    }

    if (query.targetOS) {
      results = results.filter(p => p.targetOS === query.targetOS);
    }

    if (query.searchText) {
      const text = query.searchText.toLowerCase();
      results = results.filter(p =>
        p.title.toLowerCase().includes(text) ||
        p.description.toLowerCase().includes(text) ||
        p.code.toLowerCase().includes(text) ||
        p.tags.some(t => t.toLowerCase().includes(text))
      );
    }

    // Sort by quality score (higher = better) and usage count
    results.sort((a, b) => {
      const scoreA = a.qualityScore + (a.usageCount * 0.1);
      const scoreB = b.qualityScore + (b.usageCount * 0.1);
      return scoreB - scoreA;
    });

    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Add a pattern to the knowledge store — the ONE funnel every capture path
   * (learning engine, auto-learn service, scanner, ServiceTools, manual API)
   * must go through. Enforces:
   *   1. The AUTO_LEARN_DISABLED kill switch (poisoning-loop quarantine).
   *   2. The isQualityCode gate (no markdown leaks / prose / stubs / prompt
   *      artifacts / JSX-in-ts), so re-enabling capture can't re-poison.
   * Returns null when rejected — callers must handle it.
   */
  addPattern(pattern: Omit<PatternEntry, 'id' | 'createdAt' | 'usageCount'> & { lastUsed?: string }): PatternEntry | null {
    // Kill switch — hard quarantine. Nothing enters the store while disabled,
    // regardless of which caller or what `success` flag it passes.
    if (isAutoLearnDisabled()) {
      console.log(`[knowledge] ⛔ REJECTED (AUTO_LEARN_DISABLED): ${pattern.title} — capture quarantined`);
      return null;
    }

    // Quality gate — permanent poison filter, active even when capture is
    // re-enabled. Never store markdown-fenced prose or stub/placeholder code.
    const code = pattern.code || '';
    const lang = pattern.language || 'typescript';
    if (!isQualityCode(code, lang)) {
      console.log(`[knowledge] ⛔ REJECTED (quality gate): ${pattern.title} — content is not clean code`);
      return null;
    }

    const entry: PatternEntry = {
      ...pattern,
      id: `pat_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      usageCount: 0,
      createdAt: new Date().toISOString(),
      lastUsed: pattern.lastUsed || new Date().toISOString(),
    };
    this.patterns.push(entry);
    this.save();
    console.log(`[knowledge] Added pattern: ${entry.title}`);
    
    // Auto-trigger lightweight RNN training on any new pattern
    if (!this.isBatchLoading) {
      this.quickTrainOnPattern();
    }
    
    // Check if we have hit the 100-pattern cap - archive sheet and start fresh
    if (this.patterns.length >= KnowledgeStore.SHEET_CAP) {
      // Defer archive to next tick to avoid blocking
      this.isArchiving = true;
      setTimeout(() => { this.archiveCurrentSheet(); this.isArchiving = false; }, 0);
    }
    
    return entry;
  }

  /**
   * Add multiple patterns at once, skipping individual auto-training.
   * Triggers a single quick-train at the end if there are new patterns.
   */
  batchAddPatterns(patterns: Array<Omit<PatternEntry, 'id' | 'createdAt' | 'usageCount'> & { lastUsed?: string }>): PatternEntry[] {
    const added: PatternEntry[] = [];
    this.isBatchLoading = true;
    try {
      for (const pattern of patterns) {
        // addPattern returns null when the kill switch / quality gate rejects
        // it — only keep patterns that actually got stored.
        const stored = this.addPattern(pattern);
        if (stored) added.push(stored);
      }
    } finally {
      this.isBatchLoading = false;
    }
    // Single consolidated quick-train at the end
    if (added.length > 0) {
      this.quickTrainOnPattern();
    }
    return added;
  }

  private quickTrainOnPattern(): void {
    (async () => {
      try {
        const { rnnEngine } = await import('../neural/trainer.js');
        if (!rnnEngine.isTraining) {
          const result = await rnnEngine.learnFromKnowledge(50);
          if (result.chars > 0) {
            console.log(`[knowledge] RNN quick-trained: loss=${result.loss.toFixed(2)}`);
          }
        }
      } catch {
        // Neural module not available - optional
      }
    })();
  }

  usePattern(id: string): void {
    const pattern = this.getById(id);
    if (pattern) {
      pattern.usageCount++;
      pattern.lastUsed = new Date().toISOString();
      this.save();
    }
  }

  updateQuality(id: string, score: number): void {
    const pattern = this.getById(id);
    if (pattern) {
      pattern.qualityScore = Math.max(0, Math.min(10, score));
      pattern.lastUsed = new Date().toISOString();
      this.save();
    }
  }

  deletePattern(id: string): boolean {
    const index = this.patterns.findIndex(p => p.id === id);
    if (index !== -1) {
      this.patterns.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  getRelevantContext(nodeType: string, language: string, targetOS: string, limit: number = 5): string {
    const results = this.query({ nodeType, language, targetOS, limit });
    if (results.length === 0) return '';

    let context = '\n\n--- Learned Patterns from Previous Projects ---\n';
    context += 'Here are some successful code patterns that may be relevant:\n\n';

    results.forEach((pattern, i) => {
      context += `Pattern ${i + 1}: ${pattern.title}\n`;
      context += `Description: ${pattern.description}\n`;
      context += `Tags: ${pattern.tags.join(', ')}\n`;
      context += `Code:\n${pattern.code}\n\n`;
    });

    context += '--- End of Learned Patterns ---\n'; 
    return context;
  }

  count(): number {
    return this.patterns.length;
  }

  getCurrentSheet(): number {
    return this.currentSheet;
  }

  /**
   * Archive all current patterns as a training sheet, export to LLM Training Studio,
   * and reset for a new sheet. Automatically triggered at 750 patterns.
   * Returns info about the archived sheet, or null if there were no patterns.
   */
  archiveCurrentSheet(): { sheetNumber: number; patternCount: number; exportPath: string | null } | null {
    const patterns = this.patterns;
    if (patterns.length === 0) return null;

    const sheetNumber = this.currentSheet;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `venorica-sheet-${String(sheetNumber).padStart(3, '0')}-${timestamp}.jsonl`;

    // Build export path to Training Studio
    const studioDir = path.join(process.cwd(), 'llm-training-app', 'data', 'uploads');
    let exportPath: string | null = null;

    try {
      if (!fs.existsSync(studioDir)) {
        fs.mkdirSync(studioDir, { recursive: true });
      }

      const fullPath = path.join(studioDir, filename);
      const lines = patterns.map(p => JSON.stringify({
        text: p.code,
        title: p.title,
        language: p.language,
        nodeType: p.nodeType,
        tags: p.tags,
        sheet: sheetNumber,
        source: 'venorica-sheet',
        timestamp: p.createdAt,
      }));
      fs.writeFileSync(fullPath, lines.join('\n'), 'utf-8');
      exportPath = fullPath;

      console.log(`[knowledge] Sheet #${sheetNumber} archived: ${patterns.length} patterns -> ${fullPath}`);
    } catch (e) {
      console.error('[knowledge] Failed to archive sheet:', e);
    }

    // Clear patterns and advance sheet
    this.patterns = [];

    this.currentSheet++;
    this.save();
    this.saveSheetMeta();

    console.log(`[knowledge] Started sheet #${this.currentSheet}`);

    return { sheetNumber, patternCount: patterns.length, exportPath };
  }
}

export const knowledgeStore = new KnowledgeStore();
