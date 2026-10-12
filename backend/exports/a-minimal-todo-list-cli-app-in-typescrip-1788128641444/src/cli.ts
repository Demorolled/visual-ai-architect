export interface Args {
  command: string;
  args: string[];
}

export function parseArgs(): Args {
  const command = process.argv[2] || 'help';
  const args = process.argv.slice(3);
  return { command, args };
}