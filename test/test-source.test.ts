import { describe, expect, it } from 'vitest';
import { liveTests, ONLY, withoutComments } from '../src/checker/test-source.js';

describe('withoutComments', () => {
  it('removes line and block comments, wherever they start', () => {
    const source = "expect(x).toBe(1); // it('R3: todo')\n/* it('R4') */ it('R1: kept')";
    expect(withoutComments(source)).toBe("expect(x).toBe(1); \n  it('R1: kept')");
  });

  it('leaves comment markers inside strings alone', () => {
    const source = "const mime = 'image/*'; const url = \"https://x\";\nit('R1: kept', () => {}); /** helper */";
    expect(withoutComments(source)).toBe("const mime = 'image/*'; const url = \"https://x\";\nit('R1: kept', () => {});  ");
  });
});

describe('liveTests', () => {
  it('cuts out skipped and todo blocks, nested tests included', () => {
    const source = [
      "describe.skip('old', () => { it('R1: inside a skipped describe', () => { f(')'); }); });",
      "it.skip('R2: skipped', () => {});",
      "test.todo('R3: todo');",
      "xit('R4: x-skipped', () => {});",
      "it('R5: live', () => {});",
    ].join('\n');
    const live = liveTests(source);
    for (const rule of ['R1', 'R2', 'R3', 'R4']) expect(live).not.toContain(rule);
    expect(live).toContain("it('R5: live'");
  });
});

describe('scanner edge cases', () => {
  it('reads a quote inside a regex literal as part of the regex', () => {
    const source = "expect(s).toMatch(/don't/);\n// it('R1: commented')\nconst t = 'x';";
    expect(liveTests(source)).not.toContain('R1');
  });

  it('cuts out tests skipped through the options argument', () => {
    const source = "it('R1: skipped', { skip: true }, () => {});\ntest('R2: todo', { todo: true });\nit('R3: live', { timeout: 5 }, () => {});";
    const live = liveTests(source);
    expect(live).not.toContain('R1');
    expect(live).not.toContain('R2');
    expect(live).toContain('R3');
  });

  it('flags .only, which keeps the other tests from running', () => {
    expect(ONLY.test(liveTests("it.only('R2', () => {}); it('R1', () => {});"))).toBe(true);
    expect(ONLY.test(liveTests("// it.only('R2')\nit('R1', () => {});"))).toBe(false);
  });
});
