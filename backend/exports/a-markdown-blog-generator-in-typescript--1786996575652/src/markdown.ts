interface MarkdownFile {
  path: string;
  content: string;
}

interface ParsedMarkdown {
  title: string;
  date: string;
  tags: string[];
  body: string;
}

export function parseMarkdown(file: MarkdownFile): ParsedMarkdown {
  const lines = file.content.split('\n');
  let title = '';
  let date = '';
  let tags: string[] = [];
  let body = '';

  let inHeader = true;
  for (const line of lines) {
    if (inHeader) {
      if (line.startsWith('title: ')) {
        title = line.slice(7);
      } else if (line.startsWith('date: ')) {
        date = line.slice(6);
      } else if (line.startsWith('tags: ')) {
        tags = line.slice(6).split(',').map(t => t.trim());
      } else if (line === '') {
        inHeader = false;
      }
    } else {
      body += line + '\n';
    }
  }

  return { title, date, tags, body };
}