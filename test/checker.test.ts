import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkAll, checkForm, type Finding } from '../src/checker/check.js';
import type { FormModule } from '../src/core/module.js';
import type { Repository } from '../src/core/repository.js';
import { parseInput, readBody, ruleIssue, withRules } from '../src/core/validation.js';
import { inspecaoEquipamento } from '../src/forms/inspecao-equipamento/index.js';
import { input as referenceInput } from '../src/forms/inspecao-equipamento/schema.js';
import { createService } from '../src/forms/inspecao-equipamento/service.js';
import type { InspecaoEquipamentoInput } from '../src/forms/inspecao-equipamento/types.js';
import { parseSpec } from '../src/spec/load.js';
import type { FormSpec } from '../src/spec/schema.js';

const spec = parseSpec(JSON.parse(await readFile('specs/inspecao-equipamento.json', 'utf8'))).spec as FormSpec;
const tests = await readFile('test/forms/inspecao-equipamento.test.ts', 'utf8');

/** Findings for the reference module after `mutate`, as "layer: message". */
async function check(mutate: (module: FormModule) => FormModule, source: string | null = tests): Promise<string[]> {
  const findings: Finding[] = await checkForm(spec, mutate({ ...inspecaoEquipamento }), source ?? undefined);
  return findings.map((f) => `${f.layer}: ${f.message}`);
}

const shape = inspecaoEquipamento.input.shape;
const withShape = (changes: Record<string, z.ZodType | undefined>) => {
  const next: Record<string, z.ZodType> = {};
  for (const [key, value] of Object.entries({ ...shape, ...changes })) if (value) next[key] = value;
  return z.strictObject(next);
};

/** The reference routes, validating with another schema. */
const routesWith = (input: z.ZodType) => (repository: Repository) => {
  const service = createService(repository);
  return new Hono()
    .post('/', async (c) => {
      const parsed = parseInput(input, await readBody(c), inspecaoEquipamento.messages);
      if (!parsed.ok) return c.json({ errors: parsed.errors }, 422);
      return c.json(await service.create(parsed.data as InspecaoEquipamentoInput), 201);
    })
    .get('/', async (c) => c.json(await service.list()))
    .get('/:id', async (c) => {
      const found = await service.get(c.req.param('id'));
      return found ? c.json(found) : c.json({}, 404);
    });
};

describe('checkForm', () => {
  it('accepts the hand-written reference module', async () => {
    expect(await check((m) => m)).toEqual([]);
  });

  describe('schema layer', () => {
    it('finds a wrong bound, a field made optional and a missing field', async () => {
      const input = withShape({
        codigoEquipamento: z.string().min(1).max(30),
        localInstalacao: z.string().min(1).max(40).optional(),
        situacao: undefined,
      });
      expect(await check((m) => ({ ...m, input }))).toEqual([
        'schema: field "situacao" is missing from the input schema',
        'schema: field "codigoEquipamento": maxLength is 30 in the schema, 20 in the spec',
        'schema: field "localInstalacao" is required in the spec, optional in the schema',
      ]);
    });

    it('finds fields outside the spec, computed fields taken as input and nullable fields', async () => {
      const input = withShape({ extra: z.string(), pendencias: z.int(), itensSegurancaPendentes: z.string().max(500).nullable().optional() });
      expect(await check((m) => ({ ...m, input }))).toEqual([
        'schema: field "extra" is not in the spec',
        'schema: computed field "pendencias" must not be accepted as input',
        'schema: field "itensSegurancaPendentes" accepts more than one type (nullable?): absent is how an optional field is left empty',
      ]);
    });

    it('finds a schema that lets unknown fields through, and a wrong type', async () => {
      const input = z.object({ ...shape, notaConservacao: z.number().min(1).max(5) });
      expect(await check((m) => ({ ...m, input }))).toEqual([
        'schema: input schema must reject unknown fields (z.strictObject)',
        'schema: field "notaConservacao": type is "number" in the schema, "integer" in the spec',
      ]);
    });

    it('finds enum options that drifted', async () => {
      const input = withShape({ situacao: z.enum(['liberado', 'bloqueado']) });
      expect(await check((m) => ({ ...m, input }))).toEqual([
        'schema: field "situacao": enum is ["liberado","bloqueado"] in the schema, ["liberado","liberado-com-restricoes","bloqueado"] in the spec',
      ]);
    });
  });

  describe('model layer', () => {
    it('finds wrong types, nullability, mapping, missing and extra columns', async () => {
      const { codigo_equipamento: _dropped, ...columns } = inspecaoEquipamento.model.columns;
      const model = {
        table: 'inspecoes',
        columns: {
          ...columns,
          nota_conservacao: { field: 'notaConservacao', type: 'numeric' as const, nullable: false },
          itens_seguranca_pendentes: { field: 'itensSegurancaPendentes', type: 'text' as const, nullable: false },
          situacao: { field: 'status', type: 'text' as const, nullable: false },
          legado: { field: 'legado', type: 'text' as const, nullable: true },
        },
      };
      expect(await check((m) => ({ ...m, model }))).toEqual([
        'model: table is "inspecoes", expected "inspecao_equipamento"',
        'model: column "codigo_equipamento" for field "codigoEquipamento" is missing',
        'model: column "nota_conservacao" is numeric, expected integer',
        'model: column "itens_seguranca_pendentes" must be nullable',
        'model: column "situacao" maps to "status", expected "situacao"',
        'model: column "legado" is not in the spec',
      ]);
    });
  });

  describe('messages layer', () => {
    it('finds missing, empty and unknown messages', async () => {
      const { localInstalacao: _f, ...fields } = inspecaoEquipamento.messages.fields;
      const { R3: _r, ...rules } = inspecaoEquipamento.messages.rules;
      const messages = { fields: { ...fields, responsavel: ' ', apelido: 'x' }, rules: { ...rules, R9: 'x' } };
      expect(await check((m) => ({ ...m, messages }))).toEqual([
        'messages: fields.localInstalacao has no message',
        'messages: fields.responsavel has no message',
        'messages: fields.apelido is not in the spec',
        'messages: rules.R3 has no message',
        'messages: rules.R9 is not in the spec',
      ]);
    });
  });

  describe('routes and module', () => {
    it('finds missing routes and metadata that disagrees with the spec', async () => {
      const routes = () => new Hono().post('/', (c) => c.json({}, 201));
      expect(await check((m) => ({ ...m, version: 2, resource: 'inspecoes', routes }))).toEqual([
        'module: version is 2, spec says 1',
        'module: resource is "inspecoes", spec says "inspecoes-equipamento"',
        'routes: route GET / is missing',
        'routes: route GET /:id is missing',
      ]);
    });
  });

  describe('behavior', () => {
    it('finds a rule that rejects the spec example', async () => {
      const routes = () =>
        new Hono()
          .post('/', (c) => c.json({ errors: [{ field: 'situacao', rule: 'R3' }] }, 422))
          .get('/', (c) => c.json([]))
          .get('/:id', (c) => c.json({}, 404));
      expect(await check((m) => ({ ...m, routes }))).toEqual([
        'behavior: POST /inspecoes-equipamento with the spec example answered 422: {"errors":[{"field":"situacao","rule":"R3"}]}',
      ]);
    });

    it('finds a service that loses data on the way to storage', async () => {
      const routes = () =>
        new Hono()
          .post('/', async (c) => c.json({ ...(await c.req.json()), id: '1', localInstalacao: 'outra', pendencias: 1.5 }, 201))
          .get('/', (c) => c.json([]))
          .get('/:id', (c) => c.json({}, 404));
      const findings = await check((m) => ({ ...m, routes }));
      // This fake accepts anything, so the blank-value checks fire too; they have a test of their own.
      expect(findings.filter((f) => !f.includes('a blank value must be refused'))).toEqual([
        'behavior: field "localInstalacao" came back as "outra", sent "LINHA-03"',
        'behavior: computed field "pendencias" is 1.5, expected a integer',
        'behavior: GET /inspecoes-equipamento/:id does not return the created record',
        'behavior: GET /inspecoes-equipamento does not list the created record',
        'behavior: POST /inspecoes-equipamento with an empty body answered 201, expected 422',
        'behavior: POST /inspecoes-equipamento accepted an unknown field',
      ]);
    });

    it('finds blank text and empty lists that are stored instead of refused', async () => {
      // Same JSON Schema as the reference (trim() does not show there): only sending one finds it.
      const input = withShape({
        responsavel: z.string().min(3).max(80),
        observacoesConservacao: z.string().min(1).max(500).optional(),
      });
      expect(await check((m) => ({ ...m, input, routes: routesWith(input) }))).toEqual([
        'behavior: field "responsavel" accepts "   ": a blank value must be refused, not stored',
        'behavior: field "observacoesConservacao" accepts " ": a blank value must be refused, not stored',
      ]);
    });

    it('does not take a rule that happens to reject the blank for a structure that refuses it', async () => {
      // No trim() on fields that R1 and R2 govern: the example (with failures, safety items pending) makes
      // the rules reject the blank, but with no failure the blank would be stored.
      const { messages } = inspecaoEquipamento;
      const input = withRules(
        z.strictObject({
          ...referenceInput.shape,
          descricaoFalhas: z.string().min(1).max(1000).optional(),
          itensSegurancaPendentes: z.string().min(1).max(500).optional(),
          fotosFalhas: z.array(z.string().min(1)).min(1).max(10).optional(),
        }),
        (value, ctx) => {
          if (value.possuiFalhas && !value.descricaoFalhas?.trim()) ruleIssue(ctx, 'R1', messages, 'descricaoFalhas');
          if (value.possuiFalhas && !value.fotosFalhas?.some((f) => f.trim())) ruleIssue(ctx, 'R1', messages, 'fotosFalhas');
          if (!value.itensSegurancaOk && !value.itensSegurancaPendentes?.trim()) ruleIssue(ctx, 'R2', messages, 'itensSegurancaPendentes');
        },
      );
      expect(await check((m) => ({ ...m, input, routes: routesWith(input) }))).toEqual([
        'behavior: field "itensSegurancaPendentes" accepts " ": a blank value must be refused, not stored',
        'behavior: field "descricaoFalhas" accepts " ": a blank value must be refused, not stored',
        'behavior: field "fotosFalhas" accepts [" "]: a blank value must be refused, not stored',
      ]);
    });

    it('does not take an untagged custom check for a structure that refuses the blank', async () => {
      const input = z
        .strictObject({ ...referenceInput.shape, descricaoFalhas: z.string().min(1).max(1000).optional() })
        .superRefine((value, ctx) => {
          if (value.possuiFalhas && !value.descricaoFalhas?.trim()) ctx.addIssue({ code: 'custom', path: ['descricaoFalhas'] });
        });
      expect(await check((m) => ({ ...m, input, routes: routesWith(input) }))).toEqual([
        'behavior: field "descricaoFalhas" accepts " ": a blank value must be refused, not stored',
      ]);
    });

    it('is skipped while another layer is broken: its failures would only repeat them', async () => {
      const findings = await check((m) => ({ ...m, version: 3 }));
      expect(findings).toEqual(['module: version is 3, spec says 1']);
    });
  });

  describe('tests layer', () => {
    it('requires the test file and a test named after every rule', async () => {
      expect(await check((m) => m, null)).toEqual(['tests: test/forms/inspecao-equipamento.test.ts does not exist']);
      const partial = [
        `it('R1: ...', () => {}); test("R2 and R20", () => {}); // R3 in a comment`,
        `it('R40', () => {})`,
        `  // it('R3: commented out', () => {});`,
        `/* it('R4: inside a block comment', () => {}); */`,
        `expect(1).toBe(1); // it('R1: after code, commented', () => {})`,
        `it.skip('R2: skipped', () => {});`,
        `it.only('R1: focused', () => {});`,
      ].join('\n');
      expect(await check((m) => m, partial)).toEqual([
        'tests: test/forms/inspecao-equipamento.test.ts uses .only: the other tests in it do not run',
        "tests: no test names rule R3 (e.g. it('R3: ...'))",
        "tests: no test names rule R4 (e.g. it('R4: ...'))",
      ]);
    });
  });
});

describe('checkAll', () => {
  it('pairs specs with registered modules and reports both kinds of orphan', async () => {
    const orphan = { ...inspecaoEquipamento, id: 'sem-spec', resource: 'sem-spec' };
    const findings = await checkAll({
      specs: [
        { file: 'inspecao-equipamento.json', spec, problems: [] },
        { file: 'sem-modulo.json', spec: { ...spec, id: 'sem-modulo', resource: 'sem-modulo' }, problems: [] },
        { file: 'quebrada.json', problems: ['version: expected int'] },
      ],
      modules: [inspecaoEquipamento, orphan, { ...orphan, id: 'outro' }],
      readTest: async (id) => (id === 'inspecao-equipamento' ? tests : undefined),
    });
    expect(findings).toEqual([
      { form: 'quebrada', layer: 'spec', message: 'version: expected int' },
      // Filed under every module involved, so filtering by either id still shows it.
      { form: 'sem-spec', layer: 'registry', message: 'more than one registered module has resource "sem-spec"' },
      { form: 'outro', layer: 'registry', message: 'more than one registered module has resource "sem-spec"' },
      { form: 'sem-spec', layer: 'registry', message: 'registered module has no spec' },
      { form: 'outro', layer: 'registry', message: 'registered module has no spec' },
      { form: 'sem-modulo', layer: 'registry', message: 'spec has no module in src/forms/registry.ts' },
    ]);
  });

  it('reports a repeated id under the modules that share it', async () => {
    const twin = { ...inspecaoEquipamento, resource: 'gemea' };
    const findings = await checkAll({
      specs: [{ file: 'inspecao-equipamento.json', spec, problems: [] }],
      modules: [inspecaoEquipamento, twin],
      readTest: async () => tests,
    });
    // Once per form, not once per module: both share the id.
    expect(findings.filter((f) => f.layer === 'registry')).toEqual([
      { form: 'inspecao-equipamento', layer: 'registry', message: 'more than one registered module has id "inspecao-equipamento"' },
    ]);
  });
});
