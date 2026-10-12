export async function run(args: string[]) {
  console.log('Running with args:', args);
}

export async function main() {
  const args = process.argv.slice(2);
  await run(args);
}