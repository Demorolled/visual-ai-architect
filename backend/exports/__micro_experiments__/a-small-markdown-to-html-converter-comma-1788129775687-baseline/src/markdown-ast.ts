// src/markdown-ast.ts
// Defines the abstract syntax tree (AST) structure for Markdown

type MarkdownNode = {
  type: 'paragraph' | 'header' | 'list' | 'listItem' | 'link';
  content: string;
  level?: number;
  items?: MarkdownNode[];
  url?: string;
};