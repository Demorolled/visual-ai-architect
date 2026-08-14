import { startAPI } from './api';
import { startFrontend } from './frontend';
import { runTests } from './tests';

const run = async () => {
  await startAPI();
  await startFrontend();
  await runTests();
};

run().catch((error) => {
  console.error('Application failed:', error);
});