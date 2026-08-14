import { parseCSV } from './csv-parser';

const run = async (file: string) => {
  try {
    const results = parseCSV(file);
    console.log(results);
  } catch (err) {
    console.error(err);
  }
}

const main = () => run(process.argv[2]);

if (require.main === module) {
  main();
}
