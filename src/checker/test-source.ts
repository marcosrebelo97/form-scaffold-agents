/**
 * The tests a source file really runs, for naming rules: comments are removed and skipped or
 * todo blocks are cut out whole, whether marked by name (`it.skip`, `describe.skip`, `test.todo`,
 * `xit`, ...) or by option (`it('...', { skip: true }, ...)`). A small scanner that knows strings,
 * regex literals and comments, not a parser: enough for test files.
 */

const QUOTES = new Set(["'", '"', '`']);
/** A `/` after one of these (or at the start) opens a regex literal, not a division. */
const BEFORE_REGEX = new Set(['', ...'(,=:[!&|?{};+-*%<>~^']);

/** Index just past the string that starts at `start`. Template literals are scanned as plain strings. */
function endOfString(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length && source[i] !== quote) i += source[i] === '\\' ? 2 : 1;
  return i + 1;
}

/** Index just past the regex literal that starts at `start` (a `/` inside a class does not end it). */
function endOfRegex(source: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < source.length && source[i] !== '\n') {
    const char = source[i];
    if (char === '\\') i++;
    else if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) break;
    i++;
  }
  i++;
  while (i < source.length && /[a-z]/i.test(source[i]!)) i++;
  return i;
}

type Visit = (kind: 'code' | 'literal' | 'comment', from: number, to: number) => boolean | void;

/** Calls `visit` on each code character, string or regex literal and comment; `true` stops the scan. */
function scan(source: string, visit: Visit): void {
  let i = 0;
  let last = '';
  while (i < source.length) {
    const char = source[i]!;
    let end: number;
    let kind: 'code' | 'literal' | 'comment' = 'code';
    if (QUOTES.has(char)) {
      end = endOfString(source, i);
      kind = 'literal';
    } else if (source.startsWith('//', i)) {
      end = source.indexOf('\n', i);
      if (end === -1) end = source.length;
      kind = 'comment';
    } else if (source.startsWith('/*', i)) {
      const close = source.indexOf('*/', i + 2);
      end = close === -1 ? source.length : close + 2;
      kind = 'comment';
    } else if (char === '/' && BEFORE_REGEX.has(last)) {
      end = endOfRegex(source, i);
      kind = 'literal';
    } else {
      end = i + 1;
    }
    if (visit(kind, i, end) === true) return;
    if (kind !== 'comment' && !/\s/.test(char)) last = kind === 'literal' ? 'x' : char;
    i = end;
  }
}

/** The source without comments; strings and regex literals are kept as they are. */
export function withoutComments(source: string): string {
  let out = '';
  scan(source, (kind, from, to) => {
    if (kind === 'comment') out += source[from + 1] === '*' ? ' ' : '';
    else out += source.slice(from, to);
  });
  return out;
}

/** Index just past the parenthesis that closes the one at `open`, or the end of the source. */
function endOfCall(source: string, open: number): number {
  let depth = 0;
  let close = source.length;
  scan(source.slice(open), (kind, from) => {
    if (kind !== 'code') return false;
    const char = source[open + from];
    if (char === '(') depth++;
    if (char === ')' && --depth === 0) {
      close = open + from + 1;
      return true;
    }
    return false;
  });
  return close;
}

const SKIPPED_BY_NAME = /\b(?:(?:describe|it|test)\.(?:skip|todo)|x(?:describe|it|test))\s*\(/g;
const CALL = /\b(?:describe|it|test)\s*\(/g;
const SKIP_OPTION = /^\(\s*(['"`])(?:\\.|(?!\1)[^\\])*\1\s*,\s*\{[^{}]*\b(?:skip|todo)\s*:\s*true\b/;
/** `.only` anywhere makes every other test in the file not run. */
export const ONLY = /\b(?:describe|it|test)\.only\s*\(|\bf(?:describe|it)\s*\(/;

/** Comment-free source with every skipped or todo call removed, arguments and body included. */
export function liveTests(source: string): string {
  let live = withoutComments(source);
  for (const pattern of [SKIPPED_BY_NAME, CALL]) {
    let from = 0;
    for (;;) {
      pattern.lastIndex = from;
      const match = pattern.exec(live);
      if (!match) break;
      const open = match.index + match[0].length - 1;
      const end = endOfCall(live, open);
      if (pattern === SKIPPED_BY_NAME || SKIP_OPTION.test(live.slice(open, end))) {
        live = live.slice(0, match.index) + live.slice(end);
        from = match.index;
      } else {
        from = open + 1;
      }
    }
  }
  return live;
}
