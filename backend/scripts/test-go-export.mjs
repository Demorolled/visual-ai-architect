/**
 * Test Go native project generation for Ubuntu.
 * Directly uses ProjectScaffolder with mock layers (bypassing AI).
 */
import { ProjectScaffolder } from '../src/export/scaffolder.js';

async function main() {
  const scaffolder = new ProjectScaffolder();

  const mockLayers = {
    foundation: `package pkg

// Layer 1: Foundation — config, imports, setup
import (
  "fmt"
  "os"
)`,
    functions: `package pkg

// Layer 2: Functions — per-node business logic
func Greet(name string) string {
  return fmt.Sprintf("Hello, %s! Welcome to Go native app!", name)
}`,
    integration: `package pkg

// Layer 3: Integration — wiring all nodes together
func Run() {
  name := "World"
  if len(os.Args) > 1 {
    name = os.Args[1]
  }
  msg := Greet(name)
  fmt.Println(msg)
}`,
  };

  const config = {
    projectName: 'My Go App',
    targetOS: 'linux',
    linuxDistro: 'ubuntu',
    layers: mockLayers,
    nodes: [
      {
        id: 'master-1',
        type: 'master',
        position: { x: 250, y: 50 },
        data: {
          label: 'App Blueprint',
          description: 'Main application orchestrator',
          type: 'master',
          status: 'valid',
          appGoal: 'A simple CLI tool that greets the user',
          appPurpose: 'Demonstrate Go native project generation',
          selectedOS: 'linux',
          selectedDistro: 'ubuntu',
        },
      },
      {
        id: 'node-1',
        type: 'logic',
        position: { x: 250, y: 200 },
        data: {
          label: 'Greeting Logic',
          description: 'Generate a personalized greeting message',
          type: 'logic',
          status: 'valid',
          language: 'go',
        },
      },
    ],
    edges: [{ id: 'e1', source: 'node-1', target: 'master-1' }],
    appGoal: 'A simple CLI tool that greets the user',
    appPurpose: 'Demonstrate Go native project generation',
  };

  console.log('🚀 Scaffolding Go native project for Ubuntu...\n');

  const result = await scaffolder.scaffold(config);

  console.log(`✅ ${result.message}\n`);
  console.log('📁 Generated files:');
  result.files.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));

  console.log('\n📂 Output path:', result.outputPath);
  console.log('\n--- File Listing ---');

  // List all files in the generated directory
  const fs = await import('fs/promises');
  const path = await import('path');

  async function listDir(dir, prefix = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        console.log(`  ${prefix}📁 ${entry.name}/`);
        await listDir(fullPath, prefix + '  ');
      } else {
        const stats = await fs.stat(fullPath);
        const size = stats.size;
        const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;
        // Read first line of the file for preview
        const content = await fs.readFile(fullPath, 'utf-8');
        const firstLine = content.split('\n')[0].trim().substring(0, 80);
        console.log(`  ${prefix}📄 ${entry.name} (${sizeStr}) — ${firstLine}`);
      }
    }
  }

  await listDir(result.outputPath);
}

main().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
