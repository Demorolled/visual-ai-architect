import { readdir, readFile } from 'fs/promises';

export async function readMarkdownFiles(inputDir: string): Promise<{ name: string; content: string }[]> {
  try {
    const files = await readdir(inputDir);
    const markdownFiles = files.filter((file) => file.endsWith('.md'));
    const contentPromises = markdownFiles.map((file) => readFile(`${inputDir}/${file}`, 'utf-8').then(content => ({ name: file, content }));
    const contents = await Promise.all(contentPromises);
    return contents;
  } catch (error) {
    throw new Error(`Failed to read Markdown files from directory ${inputDir}: ${error.message}`);
  }
}