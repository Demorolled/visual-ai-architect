/**
 * Live demonstration of the blueprint integrity guard.
 * Runs the REAL exported validateEdgesReferentialIntegrity from bible.ts
 * against (a) a deliberately-dangling wiring fixture and (b) a clean one,
 * proving the generator-side guard flags and drops dangling edges.
 */
import { validateEdgesReferentialIntegrity } from '../src/blueprint/bible.ts';

const danglingFixture = [
  // source references a module that is NOT in the checklist -> must be flagged
  { source_module: 'ghost_module', destination_module: 'core_engine' },
  // destination references a module that is NOT in the checklist -> must be flagged
  { source_module: 'ui_screens', destination_module: 'nope_missing' },
  // whitespace-only endpoint -> must be flagged (blank checklist trick)
  { source_module: 'ui_screens', destination_module: '   ' },
  // legitimate edge -> must be kept
  { source_module: 'ui_screens', destination_module: 'core_engine' },
  // legitimate edge -> must be kept
  { source_module: 'core_engine', destination_module: 'data_store' },
];

const cleanFixture = [
  { source_module: 'ui_screens', destination_module: 'core_engine' },
  { source_module: 'core_engine', destination_module: 'data_store' },
];

const known = ['ui_screens', 'core_engine', 'data_store'];

const bad = validateEdgesReferentialIntegrity(danglingFixture, known);
const good = validateEdgesReferentialIntegrity(cleanFixture, known);

console.log('=== DANGLING FIXTURE ===');
console.log('input wiring:', danglingFixture.length, 'edges');
console.log('flagged dangling:', bad.dangling.length, JSON.stringify(bad.dangling, null, 1));
console.log('kept (clean) edges:', bad.kept.length, '->', bad.kept.map((w) => `${w.source_module}→${w.destination_module}`).join(', '));

console.log('\n=== CLEAN FIXTURE ===');
console.log('flagged dangling:', good.dangling.length, '(expected 0)');
console.log('kept edges:', good.kept.length, '->', good.kept.map((w) => `${w.source_module}→${w.destination_module}`).join(', '));

const ok =
  bad.dangling.length === 3 &&
  bad.kept.length === 2 &&
  good.dangling.length === 0 &&
  good.kept.length === 2;
console.log('\nRESULT:', ok ? 'PASS — guard flags all 3 dangling (incl. whitespace trick) and keeps 2 clean edges' : 'FAIL');
process.exit(ok ? 0 : 1);
