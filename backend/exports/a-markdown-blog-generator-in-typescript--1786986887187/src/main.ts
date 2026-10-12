import fs from 'fs';
import path from 'path';

interface MarkdownFile {
  name: string;
  content: string;
}

async function readMarkdownFiles(inputDir: string): Promise<MarkdownFile[]> {
  return new Promise((resolve, reject) => {
    fs.readdir(inputDir, (err, files) => {
      if (err) {
        return reject(err);
      }

      const markdownFiles: MarkdownFile[] = [];
      const promises: Promise<void>[] = [];

      for (const file of files) {
        if (path.extname(file) === '.md') {
          promises.push(
            new Promise((resolve) => {
              fs.readFile(path.join(inputDir, file), 'utf8', (err, content) => {
                if (err) {
                  return reject(err);
                }
                markdownFiles.push({ name: file, content });
                resolve();
              });
            })
          );
        }
      }

      Promise.all(promises)
        .then(() => resolve(markdownFiles))
        .catch(reject);
    });
  });
}

function renderTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Blog</title>
</head>
<body>
  <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
    ${content.replace(/\n/g, '<br>') /* Convert newlines to <br> tags */}
  </div>
</body>
</html>
`;
}

async function writeFile(outputDir: string, fileName: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.writeFile(path.join(outputDir, fileName), content, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

export async function run(inputDir: string, outputDir: string): Promise<void> {
  try {
    const markdownFiles = await readMarkdownFiles(inputDir);
    for (const file of markdownFiles) {
      const html = renderTemplate(file.content);
      await writeFile(outputDir, file.name.replace('.md', '.html'), html);
    }
    console.log('Markdown blog generated successfully');
  } catch (error) {
    console.error('Error generating markdown blog:', error);
    throw error;
  }
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inputDir = args[0] || 'input';
  const outputDir = args[1] || 'output';

  try {
    await run(inputDir, outputDir);
  } catch (error) {
    console.error('Error:', error);
  }
}

main();