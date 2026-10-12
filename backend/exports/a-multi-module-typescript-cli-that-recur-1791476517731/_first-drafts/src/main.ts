export function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node main.ts <directory> [--verbose]');
    return;
  }

  const directory = args[0];
  let isVerbose = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--verbose') {
      isVerbose = true;
    } else {
      console.error(`Unknown argument: ${args[i]}`);
      return;
    }
  }

  try {
    const result = scanDirectory(directory, isVerbose);
    console.log(result);
  } catch (error) {
     process.exit(1)
}