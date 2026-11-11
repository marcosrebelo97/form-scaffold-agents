import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { createApp } from '../core/app.js';
import type { ColumnType } from '../core/model.js';
import type { FormModule } from '../core/module.js';
import { MemoryRepository } from '../core/repository.js';
import type { LoadedSpec } from '../spec/load.js';
import { fieldsOf, referenceSchema, snakeCase } from '../spec/reference.js';
import type { ComputedSpec, FieldType, FormSpec } from '../spec/schema.js';
import { liveTests, ONLY } from './test-source.js';

/**
 * Deterministic gate for a generated module: every layer must agree with the spec. It reads the
 * module's runtime values (schema as JSON Schema, model, messages, routes) and then exercises the
 * API with the spec's example. Business rules are not judged here: they are covered by the
 * module's tests, which must name every rule.
 */

export type Layer = 'spec' | 'registry' | 'module' | 'schema' | 'model' | 'messages' | 'routes' | 'behavior' | 'tests';

export interface Finding {
  form: string;
  layer: Layer;
  message: string;
}

export interface CheckInput {
  specs: readonly LoadedSpec[];
  modules: readonly FormModule[];
  /** Source of `test/forms/<id>.test.ts`, or undefined when the file does not exist. */
  readTest(id: string): Promise<string | undefined>;
}

export async function checkAll({ specs, modules, readTest }: CheckInput): Promise<Finding[]> {
  const findings: Finding[] = [];
  const valid = new Map<string, FormSpec>();

  for (const loaded of specs) {
    const form = loaded.spec?.id ?? loaded.file.replace(/\.json$/, '');
    for (const message of loaded.problems) findings.push({ form, layer: 'spec', message });
    if (loaded.spec) valid.set(loaded.spec.id, loaded.spec);
  }

  // Filed under each form involved, so `check:forms -- <id>` shows the collision too; once per form.
  for (const key of ['id', 'resource'] as const) {
    const values = modules.map((module) => module[key]);
    for (const value of new Set(values.filter((v, i) => values.indexOf(v) !== i))) {
      for (const form of new Set(modules.filter((m) => m[key] === value).map((m) => m.id))) {
        findings.push({ form, layer: 'registry', message: `more than one registered module has ${key} "${value}"` });
      }
    }
  }

  const specIds = new Set(specs.map((loaded) => loaded.spec?.id ?? loaded.file.replace(/\.json$/, '')));
  for (const module of modules) {
    if (!specIds.has(module.id)) {
      findings.push({ form: module.id, layer: 'registry', message: 'registered module has no spec' });
    }
  }
  for (const [id, spec] of valid) {
    const module = modules.find((m) => m.id === id);
    if (!module) {
      findings.push({ form: id, layer: 'registry', message: 'spec has no module in src/forms/registry.ts' });
      continue;
    }
    findings.push(...(await checkForm(spec, module, await readTest(id))));
  }
  return findings;
}

export async function checkForm(spec: FormSpec, module: FormModule, testSource: string | undefined): Promise<Finding[]> {
  const findings: Finding[] = [];
  const add = (layer: Layer, message: string) => findings.push({ form: spec.id, layer, message });

  for (const key of ['id', 'version', 'resource'] as const) {
    if (module[key] !== spec[key]) {
      add('module', `${key} is ${JSON.stringify(module[key])}, spec says ${JSON.stringify(spec[key])}`);
    }
  }
  checkSchema(spec, module, add);
  checkModel(spec, module, add);
  checkMessages(spec, module, add);
  checkRoutes(module, add);
  // Behavior depends on every other layer: run it only on a structurally sound module.
  if (findings.length === 0) await checkBehavior(spec, module, add);
  checkTests(spec, testSource, add);
  return findings;
}

type Add = (layer: Layer, message: string) => void;

// ---------------------------------------------------------------- schema

type JsonSchema = Record<string, unknown> & { properties?: Record<string, JsonSchema>; required?: string[] };

/** The constraints the spec controls. Anything else (e.g. the regex of a date) is the library's business. */
const CONSTRAINTS = ['type', 'format', 'enum', 'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems'];

function constraints(property: JsonSchema): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of CONSTRAINTS) {
    if (property[key] !== undefined) picked[key] = property[key];
  }
  // z.int() adds the safe-integer range on its own: not a constraint of the spec.
  if (picked.maximum === Number.MAX_SAFE_INTEGER) delete picked.maximum;
  if (picked.minimum === Number.MIN_SAFE_INTEGER) delete picked.minimum;
  const items = property.items as JsonSchema | undefined;
  if (items) picked['items.type'] = items.type;
  return picked;
}

function toJson(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'throw' }) as JsonSchema;
}

function checkSchema(spec: FormSpec, module: FormModule, add: Add): void {
  let actual: JsonSchema;
  try {
    actual = toJson(module.input);
  } catch (error) {
    add('schema', `input schema cannot be described as JSON Schema: ${(error as Error).message}`);
    return;
  }
  const expected = toJson(referenceSchema(spec));
  const actualProps = actual.properties ?? {};
  const expectedProps = expected.properties ?? {};
  const computed = new Set(spec.computed.map((c) => c.name));

  if (actual.additionalProperties !== false) add('schema', 'input schema must reject unknown fields (z.strictObject)');

  for (const name of Object.keys(expectedProps)) {
    if (!(name in actualProps)) add('schema', `field "${name}" is missing from the input schema`);
  }
  for (const name of Object.keys(actualProps)) {
    if (computed.has(name)) add('schema', `computed field "${name}" must not be accepted as input`);
    else if (!(name in expectedProps)) add('schema', `field "${name}" is not in the spec`);
  }

  const actualRequired = new Set(actual.required ?? []);
  const expectedRequired = new Set(expected.required ?? []);
  for (const name of Object.keys(expectedProps)) {
    if (!(name in actualProps)) continue;
    if (expectedRequired.has(name) !== actualRequired.has(name)) {
      const [inSpec, inSchema] = expectedRequired.has(name) ? ['required', 'optional'] : ['optional', 'required'];
      add('schema', `field "${name}" is ${inSpec} in the spec, ${inSchema} in the schema`);
    }

    const property = actualProps[name] as JsonSchema;
    if (property.anyOf || property.oneOf) {
      add('schema', `field "${name}" accepts more than one type (nullable?): absent is how an optional field is left empty`);
      continue;
    }
    const want = constraints(expectedProps[name] as JsonSchema);
    const have = constraints(property);
    for (const key of new Set([...Object.keys(want), ...Object.keys(have)])) {
      if (!isDeepStrictEqual(want[key], have[key])) {
        const [inSchema, inSpec] = [JSON.stringify(have[key]), JSON.stringify(want[key])];
        add('schema', `field "${name}": ${key} is ${inSchema} in the schema, ${inSpec} in the spec`);
      }
    }
  }
}

// ---------------------------------------------------------------- model

const COLUMN_TYPES: Record<FieldType | ComputedSpec['type'], ColumnType> = {
  text: 'text',
  integer: 'integer',
  decimal: 'numeric',
  boolean: 'boolean',
  date: 'date',
  enum: 'text',
  photos: 'text[]',
};

function checkModel(spec: FormSpec, module: FormModule, add: Add): void {
  const table = snakeCase(spec.id);
  if (module.model.table !== table) add('model', `table is "${module.model.table}", expected "${table}"`);

  const expected = [
    ...fieldsOf(spec).map((f) => ({ name: f.name, type: COLUMN_TYPES[f.type], nullable: !f.required })),
    ...spec.computed.map((c) => ({ name: c.name, type: COLUMN_TYPES[c.type], nullable: false })),
  ];
  const columns = module.model.columns;
  for (const { name, type, nullable } of expected) {
    const columnName = snakeCase(name);
    const column = columns[columnName];
    if (!column) {
      add('model', `column "${columnName}" for field "${name}" is missing`);
      continue;
    }
    if (column.field !== name) add('model', `column "${columnName}" maps to "${column.field}", expected "${name}"`);
    if (column.type !== type) add('model', `column "${columnName}" is ${column.type}, expected ${type}`);
    if (column.nullable !== nullable) add('model', `column "${columnName}" must be ${nullable ? 'nullable' : 'NOT NULL'}`);
  }
  const known = new Set(expected.map((e) => snakeCase(e.name)));
  for (const columnName of Object.keys(columns)) {
    if (!known.has(columnName)) add('model', `column "${columnName}" is not in the spec`);
  }
}

// ---------------------------------------------------------------- messages

function checkMessages(spec: FormSpec, module: FormModule, add: Add): void {
  const compare = (kind: 'fields' | 'rules', expected: string[]) => {
    const actual = module.messages[kind];
    for (const key of expected) {
      if (typeof actual[key] !== 'string' || actual[key].trim() === '') add('messages', `${kind}.${key} has no message`);
    }
    for (const key of Object.keys(actual)) {
      if (!expected.includes(key)) add('messages', `${kind}.${key} is not in the spec`);
    }
  };
  compare('fields', fieldsOf(spec).map((f) => f.name));
  compare('rules', spec.rules.map((r) => r.id));
}

// ---------------------------------------------------------------- routes

const ROUTES = ['POST /', 'GET /', 'GET /:id'];

function checkRoutes(module: FormModule, add: Add): void {
  const routes = new Set(module.routes(new MemoryRepository()).routes.map((r) => `${r.method} ${r.path}`));
  for (const route of ROUTES) {
    if (!routes.has(route)) add('routes', `route ${route} is missing`);
  }
}

// ---------------------------------------------------------------- behavior

const COMPUTED_TYPES: Record<ComputedSpec['type'], (value: unknown) => boolean> = {
  integer: Number.isInteger,
  decimal: (value) => typeof value === 'number' && Number.isFinite(value),
  boolean: (value) => typeof value === 'boolean',
  text: (value) => typeof value === 'string',
};

/** The example goes in through HTTP and must come back intact through every layer. */
async function checkBehavior(spec: FormSpec, module: FormModule, add: Add): Promise<void> {
  const app = createApp([module], new MemoryRepository());
  const base = `/${spec.resource}`;
  const post = (body: unknown) =>
    app.request(base, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

  const created = await post(spec.example);
  if (created.status !== 201) {
    add('behavior', `POST ${base} with the spec example answered ${created.status}: ${await created.text()}`);
    return;
  }
  const record = (await created.json()) as Record<string, unknown>;
  for (const [key, value] of Object.entries(spec.example)) {
    if (!isDeepStrictEqual(record[key], value)) {
      add('behavior', `field "${key}" came back as ${JSON.stringify(record[key])}, sent ${JSON.stringify(value)}`);
    }
  }
  for (const key of fieldsOf(spec).map((f) => f.name)) {
    if (!(key in spec.example) && key in record) add('behavior', `field "${key}" was not sent but came back`);
  }
  for (const { name, type } of spec.computed) {
    if (!COMPUTED_TYPES[type](record[name])) {
      add('behavior', `computed field "${name}" is ${JSON.stringify(record[name])}, expected a ${type}`);
    }
  }
  if (typeof record.id !== 'string') {
    add('behavior', 'the created record has no id');
    return;
  }

  const fetched = await app.request(`${base}/${record.id}`);
  if (fetched.status !== 200 || !isDeepStrictEqual(await fetched.json(), record)) {
    add('behavior', `GET ${base}/:id does not return the created record`);
  }
  const listed = await app.request(base);
  const list = listed.status === 200 ? ((await listed.json()) as unknown[]) : [];
  if (!list.some((item) => isDeepStrictEqual(item, record))) add('behavior', `GET ${base} does not list the created record`);
  if ((await app.request(`${base}/does-not-exist`)).status !== 404) {
    add('behavior', `GET ${base}/:id of an unknown id is not 404`);
  }

  const empty = await post({});
  if (empty.status !== 422) {
    add('behavior', `POST ${base} with an empty body answered ${empty.status}, expected 422`);
  } else {
    const { errors } = (await empty.json()) as { errors: { field: string; message: string }[] };
    for (const field of fieldsOf(spec).filter((f) => f.required)) {
      const error = errors.find((e) => e.field === field.name && !('rule' in e));
      if (!error) add('behavior', `an empty body does not report the required field "${field.name}"`);
      else if (error.message !== module.messages.fields[field.name]) {
        add('behavior', `required field "${field.name}" is reported with "${error.message}", not its message`);
      }
    }
  }

  const unknown = await post({ ...spec.example, campoDesconhecido: true });
  if (unknown.status !== 422) add('behavior', `POST ${base} accepted an unknown field`);

  // Absent is the only empty: blank text, empty lists and blank photo references must be refused
  // by the structure, required or not. JSON Schema cannot show a trim(), so this sends one, to the
  // input schema itself: only a built-in check counts. A custom check (a rule, tagged or not) that
  // happens to reject the blank in the example would let it through in another context.
  for (const field of fieldsOf(spec)) {
    const blanks =
      field.type === 'text'
        ? [' '.repeat(field.minLength)]
        : field.type === 'photos'
          ? [[], Array<string>(field.minItems).fill(' ')]
          : [];
    for (const blank of blanks) {
      const result = module.input.safeParse({ ...spec.example, [field.name]: blank });
      const refused = !result.success && result.error.issues.some((i) => i.path[0] === field.name && i.code !== 'custom');
      if (!refused) {
        add('behavior', `field "${field.name}" accepts ${JSON.stringify(blank)}: a blank value must be refused, not stored`);
      }
    }
  }
}

// ---------------------------------------------------------------- tests

function checkTests(spec: FormSpec, source: string | undefined, add: Add): void {
  if (source === undefined) {
    add('tests', `test/forms/${spec.id}.test.ts does not exist`);
    return;
  }
  // A commented-out or skipped test is not a test.
  const live = liveTests(source);
  if (ONLY.test(live)) add('tests', `test/forms/${spec.id}.test.ts uses .only: the other tests in it do not run`);
  for (const rule of spec.rules) {
    const named = new RegExp(`\\b(?:it|test)\\s*\\(\\s*(['"\`])[^'"\`\\n]*\\b${rule.id}\\b`);
    if (!named.test(live)) add('tests', `no test names rule ${rule.id} (e.g. it('${rule.id}: ...'))`);
  }
}
