import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { forms } from '../forms/registry.js';
import { loadSpecs } from '../spec/load.js';
import { checkAll } from './check.js';

/**
 * `npm run check:forms [-- <form-id>...]`: exit 0 only when every layer of every (selected)
 * form agrees with its spec.
 */
const root = process.cwd();
const only = new Set(process.argv.slice(2));
const specs = await loadSpecs(join(root, 'specs'));

const findings = await checkAll({
  specs,
  modules: forms,
  readTest: (id) => readFile(join(root, 'test', 'forms', `${id}.test.ts`), 'utf8').catch(() => undefined),
});

const names = new Set([
  ...specs.map((s) => s.spec?.id ?? s.file.replace(/\.json$/, '')),
  ...forms.map((f) => f.id),
  ...findings.map((f) => f.form),
]);
const selected = [...names].filter((name) => only.size === 0 || only.has(name)).sort();
for (const name of only) {
  if (!names.has(name)) {
    console.log(`✘ ${name}\n    [registry] no spec and no module with this id`);
    process.exitCode = 1;
  }
}

for (const name of selected) {
  const list = findings.filter((f) => f.form === name);
  console.log(`${list.length === 0 ? '✔' : '✘'} ${name}`);
  for (const finding of list) console.log(`    [${finding.layer}] ${finding.message}`);
  if (list.length > 0) process.exitCode = 1;
}
