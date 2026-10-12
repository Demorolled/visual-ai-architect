import { parseMarkdown } from '../markdown/markdown.ts';
import { renderHtml } from '../html/html.ts';

export async function run(inputDir: string, outputDir: string, template: string) {
  // Read Markdown files from the input directory
  const mdFiles = await readMarkdownFiles(inputDir);
  if (mdFiles.length === 0) {
    throw new Error('No Markdown files found in the input directory.');
  }

  // Parse Markdown files
  const parsedFiles = await Promise.all(
    mdFiles.map((file) => parseMarkdown(file.content, file.path))
  );

  // Generate HTML pages
  const htmlPages = parsedFiles.map((parsed) => renderHtml(parsed));

  // Write HTML pages to the output directory
  await Promise.all(htmlPages.map((page) => writeFile(page.path, page.content)));

  // Write index.html to the output directory
  const indexHtml = renderIndex(parsedFiles);
  await writeFile(outputDir + '/index.html', indexHtml);
}

async function readMarkdownFiles(dir: string): Promise<{ content: string; path: string }[]> {
  const files = await Deno.readdir(dir);
  return files
    .filter((file) => file.isFile && file.name.endsWith('.md'))
    .map((file) => ({ content: await Deno.readTextFile(dir + '/' + file.name), path: file.name }));
}

async function writeFile(path: string, content: string) {
  await Deno.writeTextFile(path, content);
}

function renderIndex(files: { title: string; path: string; date: string }[]): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog Index</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    ul { list-style: none; padding: 0; }
    li { margin: 10px 0; }
    a { text-decoration: none; color: #007bff; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Blog Index</h1>
  <ul>
    ${files
      .map((file) => `<li><a href="${file.path}">${file.title}</a> <small>${file.date}</small></li>`)
      .join('\n')}
  </ul>
</body>
</html>
`;