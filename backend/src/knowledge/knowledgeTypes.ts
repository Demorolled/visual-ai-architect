export type KnowledgeCategory = 'code_pattern' | 'architecture' | 'prompt_template';

export interface PatternEntry {
  id: string;
  category: KnowledgeCategory;
  title: string;
  code: string;
  description: string;
  tags: string[];
  projectId: string;
  targetOS: string;
  nodeType: string;
  language: string;
  success: boolean;
  usageCount: number;
  qualityScore: number;
  createdAt: string;
  lastUsed?: string;
}

export interface KnowledgeQuery {
  tags?: string[];
  nodeType?: string;
  language?: string;
  targetOS?: string;
  searchText?: string;
  limit?: number;
}

export const KNOWLEDGE_DIR = 'knowledge';
