import { MarkdownNode } from './markdown-ast';

function renderHtml(ast: MarkdownNode): string {
  switch (ast.type) {
    case 'paragraph':
      return `<p>${renderHtml(ast.content)}</p>`;
    case 'heading':
      return `<h${ast.level}>${renderHtml(ast.content)}</h${ast.level}>`;
    case 'list':
      const listItems = ast.items.map(item => `<li>${renderHtml(item)}</li>`).join('');
      return ast.ordered ? `<ol>${listItems}</ol>` : `<ul>${listItems}</ul>`;
    case 'link':
      return `<a href="${ast.url}">${renderHtml(ast.title)}</a>`;
    case 'image':
      return `<img src="${ast.url}" alt="${ast.title}" />`;
    case 'text':
      return ast.content;
    default:
      throw new Error(`Unsupported node type: ${ast.type}`);
  }
}

export { renderHtml };