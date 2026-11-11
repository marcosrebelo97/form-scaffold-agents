import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/core/app.js';
import { MemoryRepository } from '../../src/core/repository.js';
import { inspecaoEquipamento } from '../../src/forms/inspecao-equipamento/index.js';
import { compute } from '../../src/forms/inspecao-equipamento/service.js';
import type { InspecaoEquipamentoInput } from '../../src/forms/inspecao-equipamento/types.js';

const valid: InspecaoEquipamentoInput = {
  codigoEquipamento: 'CMP-0042',
  localInstalacao: 'LINHA-03',
  dataInspecao: '2026-11-10',
  responsavel: 'Equipe de manutenção',
  lubrificacaoRealizada: true,
  notaConservacao: 5,
  itensSegurancaOk: true,
  manualDisponivel: true,
  possuiFalhas: false,
  situacao: 'liberado',
};

function api() {
  const app = createApp([inspecaoEquipamento], new MemoryRepository());
  return {
    post: (body: unknown) =>
      app.request('/inspecoes-equipamento', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
  };
}

async function errorsOf(response: Response) {
  expect(response.status).toBe(422);
  return ((await response.json()) as { errors: { field: string; rule?: string }[] }).errors;
}

describe('inspecao-equipamento', () => {
  it('accepts a clean inspection and stores it with no open issues', async () => {
    const response = await api().post(valid);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ...valid, pendencias: 0 });
  });

  it('R1: a failure requires a description and at least one photo', async () => {
    const errors = await errorsOf(await api().post({ ...valid, possuiFalhas: true, situacao: 'liberado-com-restricoes' }));
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'descricaoFalhas', rule: 'R1' }),
        expect.objectContaining({ field: 'fotosFalhas', rule: 'R1' }),
      ]),
    );

    const blank = await errorsOf(
      await api().post({ ...valid, possuiFalhas: true, descricaoFalhas: '   ', fotosFalhas: [], situacao: 'bloqueado' }),
    );
    expect(blank.map((e) => e.field).sort()).toEqual(['descricaoFalhas', 'fotosFalhas']);

    const complete = { ...valid, possuiFalhas: true, descricaoFalhas: 'Vazamento', fotosFalhas: ['f/1.jpg'], situacao: 'bloqueado' };
    expect((await api().post(complete)).status).toBe(201);
  });

  it('R2: safety items out of order require the pending list', async () => {
    const errors = await errorsOf(await api().post({ ...valid, itensSegurancaOk: false }));
    expect(errors).toEqual([expect.objectContaining({ field: 'itensSegurancaPendentes', rule: 'R2' })]);
    expect((await api().post({ ...valid, itensSegurancaOk: false, itensSegurancaPendentes: 'Proteção da correia' })).status).toBe(201);
  });

  it('R3: no lubrication or a score below 3 cannot be "liberado"', async () => {
    for (const change of [{ lubrificacaoRealizada: false }, { notaConservacao: 2 }]) {
      const errors = await errorsOf(await api().post({ ...valid, ...change }));
      expect(errors).toEqual([expect.objectContaining({ field: 'situacao', rule: 'R3' })]);
      expect((await api().post({ ...valid, ...change, situacao: 'liberado-com-restricoes' })).status).toBe(201);
    }
    // The boundary: a score of 3 can be released.
    expect((await api().post({ ...valid, notaConservacao: 3 })).status).toBe(201);
  });

  it('R4: pendencias counts failures, safety items, manual and lubrication', () => {
    expect(compute(valid).pendencias).toBe(0);
    expect(compute({ ...valid, possuiFalhas: true }).pendencias).toBe(1);
    expect(
      compute({ ...valid, possuiFalhas: true, itensSegurancaOk: false, manualDisponivel: false, lubrificacaoRealizada: false })
        .pendencias,
    ).toBe(4);
  });

  it('rejects an empty equipment code or location', async () => {
    const errors = await errorsOf(await api().post({ ...valid, codigoEquipamento: '', localInstalacao: '' }));
    expect(errors.map((e) => e.field)).toEqual(['codigoEquipamento', 'localInstalacao']);
  });

  it('reports structural errors with the field message, not the library text', async () => {
    const errors = await errorsOf(await api().post({ ...valid, notaConservacao: 7, dataInspecao: '10/11/2026' }));
    expect(errors).toEqual([
      { field: 'dataInspecao', message: 'Informe a data da inspeção no formato AAAA-MM-DD.' },
      { field: 'notaConservacao', message: 'Informe a nota de conservação, um número inteiro de 1 a 5.' },
    ]);
  });
});
