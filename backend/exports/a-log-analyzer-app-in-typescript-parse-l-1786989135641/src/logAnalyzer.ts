import fs from 'fs';
import path from 'path';

interface LogLevel {
  level: string;
  count: number;
}

interface ModuleError {
  module: string;
  count: number;
}

class LogAnalyzer {
  private logData: string[];

  constructor() {
    this.logData = [];
  }

  loadLogFile(filePath: string) {
    try {
      this.logData = fs.readFileSync(filePath, 'utf-8').split('\n');
    } catch (error) {
      console.error(`Error loading log file: ${error}`);
    }
  }

  parseLog(): { [level: string]: number } {
    const levelCounts: { [level: string]: number } = {};

    for (const line of this.logData) {
      const match = line.match(/(\w+)\s+\[.*\]\s+(.*)/);
      if (match) {
        const level = match[1];
        if (levelCounts[level]) {
          levelCounts[level]++;
        } else {
          levelCounts[level] = 1;
        }
      }
    }

    return levelCounts;
  }

  getTopModulesByErrorCount(): ModuleError[] {
    const moduleCounts: { [module: string]: number } = {};

    for (const line of this.logData) {
      const match = line.match(/(\w+)\s+\[.*\]\s+(.*)/);
      if (match && match[1] === 'ERROR') {
        const module = match[2].split(' ')[0];
        if (moduleCounts[module]) {
          moduleCounts[module]++;
        } else {
          moduleCounts[module] = 1;
        }
      }
    }

    return Object.entries(moduleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([module, count]) => ({ module, count }));
  }
}

function printHelp() {
  console.log('Usage: logAnalyzer.js <logFile>');
  console.log('  <logFile>   Path to the log file');
}

if (process.argv.length < 3) {
  printHelp();
  process.exit(1);
}

const logFilePath = process.argv[2];

if (!fs.existsSync(logFilePath)) {
  console.error(`File not found: ${logFilePath}`);
  process.exit(1);
}

const analyzer = new LogAnalyzer();
analyzer.loadLogFile(logFilePath);

const levelCounts = analyzer.parseLog();
const topModules = analyzer.getTopModulesByErrorCount();

console.log('Log Level Counts:');
for (const level in levelCounts) {
  console.log(`  ${level}: ${levelCounts[level]}`);
}

console.log('\nTop Modules by Error Count:');
for (const module of topModules) {
  console.log(`  ${module.module}: ${module.count}`);
}