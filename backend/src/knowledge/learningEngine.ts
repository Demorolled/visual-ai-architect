import { knowledgeStore } from './knowledgeStore.js';
import { PatternEntry } from './knowledgeTypes.js';
import { Project } from '../types.js';
import { isQualityCode, isAutoLearnDisabled, MARKDOWN_FENCE_RE, BATCH_SEPARATOR_RE, PROMPT_ARTIFACT_RE } from './qualityGate.js';

class LearningEngine {
  /**
   * Extract code patterns from a generated project and store them in the knowledge base
   */
  learnFromProject(project: Project, generatedCode: string, success: boolean): PatternEntry[] {
    const entries: PatternEntry[] = [];

    // Kill switch: AUTO_LEARN_DISABLED=true|1 stops ALL pattern capture. The
    // poisoning loop stored broken output (markdown fences, prose, hallucinated
    // APIs) as "successful" patterns with qualityScore up to 7.5 — this gate
    // makes capture opt-in until the loop is proven fixed. Mirrors the
    // VENORICA_DISABLED convention. Covers every caller: the per-file capture in
    // fileGenerator.ts and the POST /api/knowledge/learn route. (Even if a
    // caller skips this check, addPattern itself is gated at the funnel.)
    if (isAutoLearnDisabled()) return entries;

    if (!project.nodes || project.nodes.length === 0) return entries;

    for (const node of project.nodes) {
      const code = node.data?.generatedCode || '';
      if (!code.trim()) continue;

      // Only store patterns from successful generations
      const nodeSuccess = node.data?.status === 'valid' || success;
      if (!nodeSuccess) continue;

      // Deterministic quality gate — never learn from stub/prose/JSX-in-ts code
      if (!isQualityCode(code, node.data?.language || 'typescript')) continue;

      // Generate tags from node data
      const tags: string[] = [node.type];
      if (node.data?.language) tags.push(node.data.language);
      if (project.targetOS) tags.push(project.targetOS);
      if (node.data?.label) tags.push(node.data.label.toLowerCase().replace(/\s+/g, '_'));

      // Extract key patterns from the code
      const patternCode = this.extractKeyPattern(code);
      if (!patternCode) continue;

      const entry = knowledgeStore.addPattern({
        category: 'code_pattern',
        title: `${node.data?.label || node.type} - ${node.type} pattern`,
        code: patternCode,
        description: `A ${node.type} node implementation for ${project.name}. Language: ${node.data?.language || 'unknown'}, OS: ${project.targetOS}`,
        tags,
        projectId: project.id,
        targetOS: project.targetOS || 'linux',
        nodeType: node.type,
        language: node.data?.language || 'javascript',
        success: true,
        qualityScore: Math.max(5.0, this.rateGeneratedCode(patternCode)),
      });

      // addPattern returns null when the kill switch or the funnel quality
      // gate rejects it — only count patterns that actually got stored.
      if (entry) entries.push(entry);
    }

    // Also store the overall architecture as a pattern
    if (generatedCode && success && generatedCode.length > 50) {
      const archTags = ['architecture', project.targetOS || 'linux'];
      project.nodes.forEach(n => {
        if (!archTags.includes(n.type)) archTags.push(n.type);
      });

      knowledgeStore.addPattern({
        category: 'architecture',
        lastUsed: new Date().toISOString(),
        title: `${project.name} - Full architecture`,
        code: generatedCode.substring(0, 2000), // Store first 2000 chars
        description: `Complete project architecture for ${project.name} with ${project.nodes.length} nodes targeting ${project.targetOS}`,
        tags: archTags,
        projectId: project.id,
        targetOS: project.targetOS || 'linux',
        nodeType: 'master',
        language: 'mixed',
        success: true,
        qualityScore: 5.0,
      });
    }

    console.log(`[learning] Stored ${entries.length} patterns from project "${project.name}"`);
    
    // Auto-trigger RNN training on new patterns (fire-and-forget)
    if (entries.length > 0) {
      // Fire-and-forget: train RNN on new patterns
      (async () => {
        try {
          const { rnnEngine } = await import('../neural/trainer.js');
          const result = await rnnEngine.learnFromKnowledge(100);
          // Only log when training actually ran (skipped silently when Venorica
          // is disabled or there was nothing to train — keeps the log quiet).
          if (result.chars > 0) {
            console.log(`[learning] RNN trained: loss=${result.loss.toFixed(4)}, chars=${result.chars}`);
          }
        } catch (err: any) {
          // Neural module not available or training failed — not critical
        }
      })();
    }
    
    return entries;
  }

  /**
   * Get context from past patterns to inject into LLM prompts
   */
  getGenerationContext(nodeType: string, language: string, targetOS: string): string {
    return knowledgeStore.getRelevantContext(nodeType, language, targetOS, 3);
  }

  /**
   * Extract the most relevant portion of code as a reusable pattern
   */
  private extractKeyPattern(code: string): string {
    // Remove excessive whitespace
    let cleaned = code.trim();
    
    // If code is very long, extract the most meaningful part
    // Prioritize: function definitions > class definitions > imports > the rest
    if (cleaned.length > 500) {
      const lines = cleaned.split('\n');
      
      // Try to find a function or class definition with its body
      const funcMatch = cleaned.match(/((?:async\s+)?function\s+\w+[^{]*\{[^}]*\})/);
      if (funcMatch) return funcMatch[1];
      
      const classMatch = cleaned.match(/(class\s+\w+[^{]*\{[^}]*\})/);
      if (classMatch) return classMatch[1];
      
      // Return first 500 chars
      return cleaned.substring(0, 500) + '\n// ... (truncated)';
    }
    
    return cleaned;
  }

  /**
   * Rate the quality of generated code and update stored patterns
   */
  rateGeneratedCode(code: string): number {
    let score = 5.0; // Start at neutral
    
    // Positive signals
    if (code.includes('function') || code.includes('class')) score += 1.0;
    if (code.includes('try') || code.includes('catch')) score += 0.5;
    if (code.includes('const') || code.includes('let')) score += 0.5;
    if (code.length > 200) score += 0.5;
    if (code.includes('export')) score += 0.5;
    
    // Negative signals
    if (code.includes('any')) score -= 0.3;
    if (code.includes('var ')) score -= 0.3;
    if (code.includes('TODO')) score -= 0.2;
    if (code.includes('FIXME')) score -= 0.2;
    // Markdown leaks are fatal — heavy penalty as belt-and-braces on top of
    // the isQualityCode gate (some callers may skip the gate).
    if (MARKDOWN_FENCE_RE.test(code)) score -= 4;
    if (BATCH_SEPARATOR_RE.test(code)) score -= 3;
    if (PROMPT_ARTIFACT_RE.test(code)) score -= 3;
    
    return Math.max(0, Math.min(10, score));
  }
}

export const learningEngine = new LearningEngine();
