import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSpecs, parseSpec } from '../src/spec/load.js';
import { referenceSchema, snakeCase } from '../src/spec/reference.js';

const minimal = {
  id: 'teste',
  version: 1,
  title: 'Teste',
  description: 'Formulário de teste',
  resource: 'testes',
  sections: [{ id: 'geral', title: 'Geral', fields: [{ name: 'nome', label: 'Nome', type: 'text', required: true, minLength: 1, maxLength: 10 }] }],
  example: { nome: 'Ana' },
};

describe('parseSpec', () => {
  it('accepts a minimal spec and fills the defaults', () => {
    const { spec, problems } = parseSpec(minimal);
    expect(problems).toEqual([]);
    expect(spec).toMatchObject({ computed: [], rules: [] });
  });

  it('reports schema problems with their path', () => {
    const { problems } = parseSpec({ ...minimal, id: 'Teste', sections: [{ id: 'geral', title: 'Geral', fields: [{ name: 'x', label: 'X', type: 'text' }] }] });
    expect(problems).toEqual(['id: Invalid string: must match pattern /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/', 'sections.0.fields.0.maxLength: Invalid input: expected number, received undefined']);
  });

  it('rejects repeated names and incoherent bounds', () => {
    const fields = [
      { name: 'nome', label: 'Nome', type: 'text', maxLength: 5, minLength: 6 },
      { name: 'nome', label: 'Nome', type: 'integer', min: 5, max: 1 },
      { name: 'nota', label: 'Nota', type: 'integer', min: 0.5 },
      { name: 'fotos', label: 'Fotos', type: 'photos', minItems: 3, maxItems: 2 },
      { name: 'tipo', label: 'Tipo', type: 'enum', options: ['a', 'a'] },
    ];
    const { problems } = parseSpec({
      ...minimal,
      sections: [{ id: 'geral', title: 'Geral', fields }],
      computed: [{ name: 'tipo', type: 'text', description: 'x' }],
      rules: [{ id: 'R1', description: 'x' }, { id: 'R1', description: 'y' }],
    });
    expect(problems).toEqual([
      'field "nome" is declared more than once',
      'field "tipo" is declared more than once',
      'rule "R1" is declared more than once',
      'field "nome": minLength is greater than maxLength',
      'field "nome": min is greater than max',
      'field "nota": integer bounds must be integers',
      'field "fotos": minItems is greater than maxItems',
      'field "tipo": repeated options',
    ]);
  });

  it('never lets a text or a photo list be empty: absent is the only empty', () => {
    const fields = [
      { name: 'nome', label: 'Nome', type: 'text', required: true, maxLength: 10 },
      { name: 'obs', label: 'Obs', type: 'text', maxLength: 10 },
      { name: 'fotos', label: 'Fotos', type: 'photos', maxItems: 2 },
    ];
    const { spec } = parseSpec({ ...minimal, sections: [{ id: 'geral', title: 'Geral', fields }] });
    expect(spec!.sections[0]!.fields).toMatchObject([{ minLength: 1 }, { minLength: 1 }, { minItems: 1 }]);
    expect(parseSpec({ ...minimal, sections: [{ id: 'geral', title: 'Geral', fields: [{ ...fields[1], minLength: 0 }] }] }).problems).toEqual([
      'sections.0.fields.0.minLength: Too small: expected number to be >=1',
    ]);

    const schema = referenceSchema(spec!);
    for (const blank of [{ nome: '   ' }, { nome: 'Ana', obs: '' }, { nome: 'Ana', fotos: [] }]) {
      expect(schema.safeParse(blank).success).toBe(false);
    }
    expect(schema.safeParse({ nome: 'Ana' }).success).toBe(true);
  });

  it('requires an example that the structure accepts', () => {
    const { problems } = parseSpec({ ...minimal, example: { nome: 'um nome longo demais', idade: 3 } });
    expect(problems).toEqual(['example.nome: Too big: expected string to have <=10 characters', 'example: Unrecognized key: "idade"']);
  });
});

describe('referenceSchema', () => {
  it('maps each field type to its structural schema', () => {
    const { spec } = parseSpec({
      ...minimal,
      sections: [
        {
          id: 'geral',
          title: 'Geral',
          fields: [
            { name: 'quando', label: 'Quando', type: 'date', required: true },
            { name: 'valor', label: 'Valor', type: 'decimal', min: 0 },
            { name: 'fotos', label: 'Fotos', type: 'photos', maxItems: 2 },
          ],
        },
      ],
      example: { quando: '2026-11-10' },
    });
    const schema = referenceSchema(spec!);
    expect(schema.safeParse({ quando: '2026-11-10', valor: 1.5, fotos: ['a'] }).success).toBe(true);
    expect(schema.safeParse({ quando: '2026-02-30' }).success).toBe(false);
    expect(schema.safeParse({ quando: '2026-11-10', valor: -1 }).success).toBe(false);
    expect(schema.safeParse({ quando: '2026-11-10', fotos: ['a', 'b', 'c'] }).success).toBe(false);
  });

  it('names columns and tables in snake_case', () => {
    expect(snakeCase('codigoEquipamento')).toBe('codigo_equipamento');
    expect(snakeCase('inspecao-equipamento')).toBe('inspecao_equipamento');
  });
});

describe('loadSpecs', () => {
  it('reports invalid JSON and an id that does not match the file name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'specs-'));
    await writeFile(join(dir, 'quebrada.json'), '{');
    await writeFile(join(dir, 'outro-nome.json'), JSON.stringify(minimal));
    await writeFile(join(dir, 'teste.json'), JSON.stringify(minimal));
    await writeFile(join(dir, 'leia-me.txt'), 'ignored');
    const loaded = await loadSpecs(dir);
    expect(loaded.map(({ file, problems }) => [file, problems.map((p) => p.split(':')[0])])).toEqual([
      ['outro-nome.json', ['id "teste" does not match the file name']],
      ['quebrada.json', ['invalid JSON']],
      ['teste.json', []],
    ]);
  });
});
