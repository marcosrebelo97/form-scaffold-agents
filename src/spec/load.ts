import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fieldsOf, referenceSchema } from './reference.js';
import { formSpec, type FormSpec } from './schema.js';

/**
 * Parses a spec and checks what a schema cannot express: unique names, coherent bounds and
 * an example that the structure accepts. Returns every problem, not just the first.
 */
export function parseSpec(raw: unknown): { spec: FormSpec; problems: [] } | { spec?: undefined; problems: string[] } {
  const parsed = formSpec.safeParse(raw);
  if (!parsed.success) {
    return { problems: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(spec)'}: ${issue.message}`) };
  }
  const spec = parsed.data;
  const problems: string[] = [];

  const duplicates = (values: string[]) => values.filter((value, index) => values.indexOf(value) !== index);
  for (const name of duplicates([...fieldsOf(spec).map((f) => f.name), ...spec.computed.map((c) => c.name)])) {
    problems.push(`field "${name}" is declared more than once`);
  }
  for (const id of duplicates(spec.sections.map((s) => s.id))) problems.push(`section "${id}" is declared more than once`);
  for (const id of duplicates(spec.rules.map((r) => r.id))) problems.push(`rule "${id}" is declared more than once`);

  for (const field of fieldsOf(spec)) {
    if ((field.type === 'integer' || field.type === 'decimal') && field.min !== undefined && field.max !== undefined) {
      if (field.min > field.max) problems.push(`field "${field.name}": min is greater than max`);
    }
    if (field.type === 'integer') {
      for (const bound of [field.min, field.max]) {
        if (bound !== undefined && !Number.isInteger(bound)) {
          problems.push(`field "${field.name}": integer bounds must be integers`);
        }
      }
    }
    if (field.type === 'text' && field.minLength > field.maxLength) {
      problems.push(`field "${field.name}": minLength is greater than maxLength`);
    }
    if (field.type === 'photos' && field.minItems > field.maxItems) {
      problems.push(`field "${field.name}": minItems is greater than maxItems`);
    }
    if (field.type === 'enum' && duplicates(field.options).length > 0) {
      problems.push(`field "${field.name}": repeated options`);
    }
  }

  if (problems.length === 0) {
    const example = referenceSchema(spec).safeParse(spec.example);
    if (!example.success) {
      for (const issue of example.error.issues) problems.push(`${['example', ...issue.path].join('.')}: ${issue.message}`);
    }
  }
  return problems.length > 0 ? { problems } : { spec, problems: [] };
}

export interface LoadedSpec {
  file: string;
  spec?: FormSpec;
  problems: string[];
}

/** Every `*.json` in `dir`, parsed. A spec's id must match its file name. */
export async function loadSpecs(dir: string): Promise<LoadedSpec[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  const loaded: LoadedSpec[] = [];
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(join(dir, file), 'utf8'));
    } catch (error) {
      loaded.push({ file, problems: [`invalid JSON: ${(error as Error).message}`] });
      continue;
    }
    const result = parseSpec(raw);
    if (result.spec && `${result.spec.id}.json` !== file) {
      loaded.push({ file, problems: [`id "${result.spec.id}" does not match the file name`] });
    } else {
      loaded.push({ file, ...result });
    }
  }
  return loaded;
}
