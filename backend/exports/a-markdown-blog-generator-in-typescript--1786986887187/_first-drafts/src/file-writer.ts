export async function writeFile(filePath: string, content: string): Promise<void> {
  try {
    await Deno.writeTextFile(filePath, content);
  } catch (error) {
    console.error(`Failed to write file ${filePath}: ${error.message}`);
    throw error;
  }
}