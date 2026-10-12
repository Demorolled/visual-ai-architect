type MarkdownNode = {
  type: 'heading' | 'paragraph' | 'link' | 'text' | 'list';
  content: string;
  level?: number;
  items?: MarkdownNode[];
  url?: string;
};

function renderHtml(ast: MarkdownNode): string {
  switch (ast.type) {
    case 'paragraph':
      return `<p>${ast.content}</p>`;
    case 'heading':
      return `<h${ast.level}>${ast.content}</h${ast.level}>`;
    case 'list':
      const listItems = ast.items?.map(item => `<li>${renderHtml(item)}</li>`).join('') || '';
      return ast.type === 'list' && Array.isArray(ast.items) ? `<ul>${listItems}</ul>` : '';
    case 'link':
      return `<a href="${ast.url}">${ast.content}</a>`;
    case 'text':
      return ast.content;
    default:
      throw new Error(`Unsupported node type: ${ast.type}`);
  }
}

export { renderHtml };