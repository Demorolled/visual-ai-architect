export interface MarkdownNode {
  type: 'heading' | 'paragraph' | 'link' | 'text';
  content: string;
  level?: number;
  url?: string;
}

export function parseMarkdown(input: string): MarkdownNode[] {
  const lines = input.split('\n');
  const ast: MarkdownNode[] = [];

  for (const line of lines) {
    if (line.startsWith('#')) {
      const level = (line.match(/#/g) || []).length;
      ast.push({ type: 'heading', content: line.slice(level).trim(), level });
    } else if (line.startsWith('[')) {
      const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        ast.push({ type: 'link', content: linkMatch[1], url: linkMatch[2] });
      }
    } else if (line.trim() !== '') {
      ast.push({ type: 'paragraph', content: line.trim() });
    } else {
      ast.push({ type: 'text', content: '\n' });
    }
  }

  return ast;
}