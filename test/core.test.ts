import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MAX_BODY_BYTES, createApp } from '../src/core/app.js';
import { defineModel, fromRow, toRow } from '../src/core/model.js';
import { ConstraintError, MemoryRepository } from '../src/core/repository.js';
import { parseInput, ruleIssue, withRules } from '../src/core/validation.js';
import { forms } from '../src/forms/registry.js';

const model = defineModel({
  table: 'exemplo',
  columns: {
    nome_completo: { field: 'nomeCompleto', type: 'text', nullable: false },
    apelido: { field: 'apelido', type: 'text', nullable: true },
  },
});

describe('model', () => {
  it('maps records to rows and back, leaving absent optional fields absent', () => {
    const row = toRow(model, { nomeCompleto: 'Ana' });
    expect(row).toEqual({ nome_completo: 'Ana', apelido: null });
    expect(fromRow(model, { ...row, id: '1', created_at: 't' })).toEqual({ id: '1', createdAt: 't', nomeCompleto: 'Ana' });
  });

  it('reserves the system columns', () => {
    expect(() => defineModel({ table: 't', columns: { id: { field: 'id', type: 'text', nullable: false } } })).toThrow('reserved');
  });
});

describe('MemoryRepository', () => {
  it('enforces NOT NULL and unknown columns like a database', async () => {
    const repository = new MemoryRepository();
    await expect(repository.insert(model, { nome_completo: null })).rejects.toThrow(ConstraintError);
    await expect(repository.insert(model, { nome_completo: 'Ana', idade: 3 })).rejects.toThrow('unknown column "idade"');
  });

  it('stores copies: callers cannot change what was saved', async () => {
    const repository = new MemoryRepository(() => new Date('2026-11-10T12:00:00Z'));
    const row = { nome_completo: 'Ana', apelido: null };
    const saved = await repository.insert(model, row);
    row.nome_completo = 'mudou';
    saved.nome_completo = 'mudou';
    expect(await repository.get(model, saved.id as string)).toEqual({ ...row, nome_completo: 'Ana', id: saved.id, created_at: '2026-11-10T12:00:00.000Z' });
    expect(await repository.list(model)).toHaveLength(1);
    expect(await repository.get(model, 'nao-existe')).toBeUndefined();
  });
});

describe('parseInput', () => {
  const messages = { fields: { idade: 'Informe a idade.' }, rules: { R1: 'Menores precisam de responsável.' } };
  const schema = z.strictObject({ idade: z.int().min(0), responsavel: z.string().optional() }).superRefine((value, ctx) => {
    if (value.idade < 18 && !value.responsavel) ruleIssue(ctx, 'R1', messages, 'responsavel');
  });

  it('uses the field message for structural errors, once per field', () => {
    expect(parseInput(schema, { idade: -1.5 }, messages)).toEqual({ ok: false, errors: [{ field: 'idade', message: 'Informe a idade.' }] });
  });

  it('withRules runs the rules only on structurally valid input, so they never hide a broken value', () => {
    const texts = { fields: { nome: 'Nome com até 5 letras, ou nada.' }, rules: { R1: 'Informe o nome.' } };
    const schema = withRules(z.strictObject({ nome: z.string().trim().min(1).max(5).optional(), vip: z.boolean() }), (value, ctx) => {
      if (value.vip && !value.nome) ruleIssue(ctx, 'R1', texts, 'nome');
    });
    // A blank name breaks the structure: the field message, and no rule.
    expect(parseInput(schema, { nome: ' ', vip: true }, texts)).toEqual({
      ok: false,
      errors: [{ field: 'nome', message: 'Nome com até 5 letras, ou nada.' }],
    });
    // A valid structure: now the rule speaks.
    expect(parseInput(schema, { vip: true }, texts)).toEqual({ ok: false, errors: [{ field: 'nome', message: 'Informe o nome.', rule: 'R1' }] });
    expect(parseInput(schema, { nome: ' Ana ', vip: true }, texts)).toEqual({ ok: true, data: { nome: 'Ana', vip: true } });
  });

  it('reports rules with their id, unknown fields and a body that is not an object', () => {
    expect(parseInput(schema, { idade: 10 }, messages)).toEqual({
      ok: false,
      errors: [{ field: 'responsavel', message: 'Menores precisam de responsável.', rule: 'R1' }],
    });
    expect(parseInput(schema, { idade: 30, extra: 1 }, messages)).toEqual({
      ok: false,
      errors: [{ field: 'extra', message: 'Campo não reconhecido neste formulário.' }],
    });
    expect(parseInput(schema, undefined, messages)).toEqual({
      ok: false,
      errors: [{ field: '', message: 'O corpo da requisição deve ser um objeto JSON.' }],
    });
  });
});

describe('createApp', () => {
  it('lists the registered forms and answers JSON for unknown paths and invalid bodies', async () => {
    const app = createApp(forms, new MemoryRepository());
    expect(await (await app.request('/forms')).json()).toEqual(forms.map(({ id, version, resource }) => ({ id, version, resource })));
    expect((await app.request('/nao-existe')).status).toBe(404);
    const invalid = await app.request(`/${forms[0]!.resource}`, { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } });
    expect(invalid.status).toBe(422);
  });

  it('refuses a body over the limit with 413, with or without a Content-Length', async () => {
    const app = createApp(forms, new MemoryRepository());
    const path = `/${forms[0]!.resource}`;
    const big = JSON.stringify({ x: 'a'.repeat(MAX_BODY_BYTES) });
    const declared = await app.request(path, { method: 'POST', body: big, headers: { 'content-type': 'application/json' } });
    expect(declared.status).toBe(413);
    expect(await declared.json()).toEqual({ error: 'Corpo da requisição grande demais.' });

    const stream = new Blob([big]).stream();
    const chunked = await app.request(path, {
      method: 'POST',
      body: stream,
      headers: { 'content-type': 'application/json' },
      duplex: 'half',
    } as RequestInit);
    expect(chunked.status).toBe(413);
  });
});
