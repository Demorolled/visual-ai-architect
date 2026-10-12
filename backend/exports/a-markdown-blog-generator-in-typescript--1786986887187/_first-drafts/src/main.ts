import { readMarkdownFiles } from '../markdown-reader';
import { renderTemplate } from '../template-renderer';
import { writeFile } from '../file-writer';

export async function run(inputDir: string, outputDir: string): Promise<void> {
  try {
    const markdownFiles = await readMarkdownFiles(inputDir);
    for (const file of markdownFiles) {
      const html = renderTemplate(file.content);
      await writeFile(outputDir, file.name, html);
    }
    console.log('Markdown blog generated successfully');
  } catch (error) {
    console.error('Error generating markdown blog:', error);
    throw error;
  }
}

export async function main(): Promise<void> {
  const inputDir = 'input';
  const outputDir = 'output';
  await run(inputDir, outputDir);
}