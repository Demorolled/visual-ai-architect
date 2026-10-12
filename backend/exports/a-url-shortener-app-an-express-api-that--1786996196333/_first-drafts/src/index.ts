import { generateShortCode, getLongUrl, saveMapping } from './shortener';

export async function run() {
  const shortCode = generateShortCode(); // Generate a random short code
  saveMapping(shortCode, 'https://www.example.com'); // Save the mapping to the database
  console.log(`Generated short code: ${shortCode}`);
  const longUrl = getLongUrl(shortCode); // Retrieve the long URL from the database
  console.log(`Long URL: ${longUrl}`);
}

export async function main() {
  await run();
}