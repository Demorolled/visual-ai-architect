// Entry point: parses args, orchestrates the conversion process

import { parseMarkdown } from './markdown-parser';
import { renderHtml } from './html-renderer';
import { readFile, writeFile } from './file-handler';
import { config } from './config';

export async function run(argv: string[]) {
  try {
    if (argv.length < 3) {
      console.error('Usage: node index.js <input-file> <output-file>');
      process.exit(1);
    }

    const inputFilePath = argv[1];
    const outputFilePath = argv[2];

    const markdownContent = await readFile(inputFilePath);

    if (!markdownContent) {
      console.error('Error reading input file.');
      process.exit(1);
    }

    const ast = parseMarkdown(markdownContent);
    const htmlContent = renderHtml(ast);

    if (!htmlContent) {
      console.error('Error rendering HTML.');
      process.exit(1);
    }

    await writeFile(outputFilePath, htmlContent);

    console.log('Conversion successful.');
  } catch (error) {
    console.error('An unexpected error occurred:', error.message);
    process.exit(1);
  }
}
