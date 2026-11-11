import { execFileSync } from 'node:child_process';
import { kebabCase } from '../spec/schema.js';

/**
 * What a generated module may touch: its own folder, its test and the registry. Everything else
 * (spec, core, checker, tests of other parts, package.json, CI, agent definitions) is the gate or
 * belongs to a human.
 */
export function scopeViolations(id: string, changed: readonly string[]): string[] {
  if (!kebabCase.test(id)) throw new Error(`not a form id: ${JSON.stringify(id)}`);
  const allowed = (path: string) =>
    path.startsWith(`src/forms/${id}/`) || path === `test/forms/${id}.test.ts` || path === 'src/forms/registry.ts';
  return changed.filter((path) => !allowed(path));
}

/**
 * Where a hidden file (ignored, or flagged in the index) could change what the gate runs. Outside
 * these, a hidden file is the developer's own (.env, .idea/, .claude/settings.local.json).
 */
const GATE_DIRS = ['src/', 'test/', 'specs/', 'playbook/', '.claude/agents/', '.claude/commands/', '.github/'];
const GATE_FILES = new Set(['package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts', '.gitignore']);
const inGate = (path: string) => GATE_FILES.has(path) || GATE_DIRS.some((dir) => path.startsWith(dir));

/** A commit, never something git would read as an option. */
export function resolveBase(cwd: string, base: string): string {
  if (base === '' || base.startsWith('-')) throw new Error(`not a commit: ${JSON.stringify(base)}`);
  try {
    return execFileSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { cwd, encoding: 'utf8' }).trim();
  } catch {
    throw new Error(`not a commit: ${JSON.stringify(base)}`);
  }
}

/**
 * Every path that differs from `base`, however it got there:
 * - committed or not, against `base` itself, not against HEAD: a `git commit` cannot hide a change;
 * - untracked files;
 * - in the gate's paths, ignored files and files flagged assume-unchanged or skip-worktree, which
 *   `git diff` would not compare: a new ignore pattern or an index flag cannot hide a change.
 * Renames count as two paths (`--no-renames`). node_modules/ is not inspected: the workflow runs
 * `npm ci` before this check, which also runs on it.
 */
export function changedPaths(cwd: string, base: string): string[] {
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const list = (output: string) => output.split('\0').filter(Boolean);

  const commit = resolveBase(cwd, base);
  const paths = new Set([
    ...list(git('diff', '--name-only', '--no-renames', '-z', commit, '--')),
    ...list(git('ls-files', '--others', '--exclude-standard', '-z')),
    ...list(git('ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', ...GATE_DIRS, ...GATE_FILES)),
  ]);
  // `git ls-files -v`: lowercase tag = assume-unchanged, S = skip-worktree.
  for (const entry of list(git('ls-files', '-v', '-z'))) {
    if (/^[a-zS] /.test(entry) && inGate(entry.slice(2))) paths.add(entry.slice(2));
  }
  return [...paths].sort();
}
