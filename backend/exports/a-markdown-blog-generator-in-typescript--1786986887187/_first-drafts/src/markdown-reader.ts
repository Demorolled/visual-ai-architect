export async function readMarkdownFiles(inputDir: string): Promise<string[]> {
  try {
    const files = await Deno.readdir(inputDir);
    const markdownFiles = files.filter((file) => file.endsWith('.md'));
    const contentPromises = markdownFiles.map((file) => Deno.readTextFile(`${inputDir}/${file}`));
    const contents = await Promise.all(contentPromises);
    return contents;
  } catch (error) {
    throw new Error(`Failed to read Markdown files from directory ${inputDir}: ${error.message}`);
  }
}