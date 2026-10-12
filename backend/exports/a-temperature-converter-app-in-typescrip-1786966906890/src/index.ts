export function convertTemperature(temp: number, from: 'C' | 'F', to: 'C' | 'F'): number {
  if (from === to) return temp;
  if (from === 'C') return (temp * 9/5) + 32;
  return (temp - 32) * 5/9;
}

const args = process.argv.slice(2);
if (args.length !== 3) {
  console.error('Usage: node index.ts <temperature> <from> <to>');
  console.error('Example: node index.ts 25 C F');
  process.exit(1);
}

const temp = parseFloat(args[0]);
const from = args[1] as 'C' | 'F';
const to = args[2] as 'C' | 'F';

if (isNaN(temp)) {
  console.error('Invalid temperature value. Please enter a number.');
  process.exit(1);
}

if (!['C', 'F'].includes(from) || !['C', 'F'].includes(to)) {
  console.error('Invalid unit. Please use "C" for Celsius or "F" for Fahrenheit.');
  process.exit(1);
}

const result = convertTemperature(temp, from, to);
console.log(`${temp}°${from} is ${result.toFixed(2)}°${to}`);