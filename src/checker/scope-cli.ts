import { changedPaths, scopeViolations } from './scope.js';

/**
 * `npm run check:scope -- <form-id> [--base <commit>]`: exit 0 only when nothing outside the
 * module changed since `base` (default HEAD). /novo-formulario passes the commit it started from.
 */
const args = process.argv.slice(2);
const [id, flag] = args;
const base = flag === '--base' ? args[2] : 'HEAD';
if (!id || (flag !== undefined && flag !== '--base') || base === undefined || args.length > (flag ? 3 : 1)) {
  console.error('usage: npm run check:scope -- <form-id> [--base <commit>]');
  process.exit(2);
}

const violations = scopeViolations(id, changedPaths(process.cwd(), base));
if (violations.length === 0) {
  console.log(`✔ ${id}: since ${base}, only the module, its test and the registry changed`);
} else {
  console.log(`✘ ${id}: changes outside the module's scope since ${base}`);
  for (const path of violations) console.log(`    ${path}`);
  process.exitCode = 1;
}
