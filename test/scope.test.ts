import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { changedPaths, resolveBase, scopeViolations } from '../src/checker/scope.js';

describe('scopeViolations', () => {
  it('allows only the module folder, its test and the registry', () => {
    const changed = [
      'src/forms/ordem-servico/schema.ts',
      'test/forms/ordem-servico.test.ts',
      'src/forms/registry.ts',
      'src/forms/ordem-servico-v2/schema.ts',
      'src/forms/inspecao-equipamento/schema.ts',
      'test/forms/inspecao-equipamento.test.ts',
      'specs/ordem-servico.json',
      'src/spec/reference.ts',
      'package.json',
      '.github/workflows/ci.yml',
      'test/core.test.ts',
    ];
    expect(scopeViolations('ordem-servico', changed)).toEqual(changed.slice(3));
  });

  it('refuses an id that could escape the forms folder', () => {
    expect(() => scopeViolations('../core', [])).toThrow('not a form id');
  });
});

describe('changedPaths', () => {
  let dir: string;
  let base: string;
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, encoding: 'utf8' }).trim();
  const violations = () => scopeViolations('x', changedPaths(dir, base));

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'scope-'));
    git('init', '-q');
    await mkdir(join(dir, 'src/checker'), { recursive: true });
    await mkdir(join(dir, 'src/forms/x'), { recursive: true });
    await writeFile(join(dir, 'src/checker/check.ts'), 'gate');
    await writeFile(join(dir, '.gitignore'), 'node_modules/\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    base = git('rev-parse', 'HEAD');
  });

  it('is clean when only the module changed, even with node_modules present', async () => {
    await writeFile(join(dir, 'src/forms/x/schema.ts'), 'module');
    await mkdir(join(dir, 'node_modules/zod'), { recursive: true });
    await writeFile(join(dir, 'node_modules/zod/index.js'), 'lib');
    expect(violations()).toEqual([]);
  });

  it('sees both sides of a move out of the gate', async () => {
    await rename(join(dir, 'src/checker/check.ts'), join(dir, 'src/forms/x/check.ts'));
    git('add', '-A');
    expect(violations()).toEqual(['src/checker/check.ts']);
  });

  it('sees a gate change that was committed after the base', async () => {
    await writeFile(join(dir, 'src/checker/check.ts'), 'weakened');
    git('commit', '-qam', 'wip');
    expect(violations()).toEqual(['src/checker/check.ts']);
  });

  it('sees a file hidden with skip-worktree or assume-unchanged', async () => {
    git('update-index', '--skip-worktree', 'src/checker/check.ts');
    expect(violations()).toEqual(['src/checker/check.ts']);
    git('update-index', '--no-skip-worktree', 'src/checker/check.ts');
    git('update-index', '--assume-unchanged', 'src/checker/check.ts');
    expect(violations()).toEqual(['src/checker/check.ts']);
  });

  it("ignores the developer's own hidden files outside the gate", async () => {
    await writeFile(join(dir, '.env'), 'SECRET=1');
    await mkdir(join(dir, '.claude'), { recursive: true });
    await writeFile(join(dir, '.claude/settings.local.json'), '{}');
    await appendFile(join(dir, '.git/info/exclude'), '.env\n.claude/settings.local.json\n');
    expect(violations()).toEqual([]);
  });

  it('refuses a base that is missing, not a commit, or an option', () => {
    for (const bad of ['', '--output=/tmp/x', 'nao-existe']) expect(() => resolveBase(dir, bad)).toThrow('not a commit');
    expect(resolveBase(dir, 'HEAD')).toBe(base);
  });

  it('sees a file hidden by a new ignore pattern', async () => {
    await writeFile(join(dir, 'src/checker/override.ts'), 'evil');
    await appendFile(join(dir, '.git/info/exclude'), 'src/checker/override.ts\n');
    expect(violations()).toEqual(['src/checker/override.ts']);
  });
});
