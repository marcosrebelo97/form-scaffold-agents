import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/core/app.js';
import { MemoryRepository } from '../../src/core/repository.js';
import { ordemServico } from '../../src/forms/ordem-servico/index.js';
import { compute } from '../../src/forms/ordem-servico/service.js';
import type { OrdemServicoInput } from '../../src/forms/ordem-servico/types.js';

const valid: OrdemServicoInput = {
  codigoEquipamento: 'CMP-0042',
  numeroOrdem: 'OS-2026-0187',
  dataEncerramento: '2026-11-12',
  tecnico: 'Equipe de manutenção',
  concluidaNoPrazo: true,
  equipamentoLiberado: true,
  houveTrocaPecas: false,
  horasTrabalhadas: 2,
  cobertura: 'contrato',
};

const pecas = { houveTrocaPecas: true, descricaoPecas: 'Rolamento', fotosPecas: ['f/1.jpg'] };

function api() {
  const app = createApp([ordemServico], new MemoryRepository());
  return {
    get: (path: string) => app.request(path),
    post: (body: unknown) =>
      app.request('/ordens-servico', {
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

describe('ordem-servico', () => {
  it('accepts a clean service order and stores it with no cost', async () => {
    const response = await api().post(valid);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ...valid, custoTotal: 0 });
  });

  it('R1: late requires the days of delay; on time forbids them', async () => {
    const late = await errorsOf(await api().post({ ...valid, concluidaNoPrazo: false }));
    expect(late).toEqual([expect.objectContaining({ field: 'diasAtraso', rule: 'R1' })]);
    // The boundary: one day of delay is accepted.
    expect((await api().post({ ...valid, concluidaNoPrazo: false, diasAtraso: 1 })).status).toBe(201);

    const onTime = await errorsOf(await api().post({ ...valid, diasAtraso: 1 }));
    expect(onTime).toEqual([expect.objectContaining({ field: 'diasAtraso', rule: 'R1' })]);

    // Zero days is out of the field's range: a structural error, not the rule.
    const zero = await errorsOf(await api().post({ ...valid, concluidaNoPrazo: false, diasAtraso: 0 }));
    expect(zero).toEqual([{ field: 'diasAtraso', message: ordemServico.messages.fields.diasAtraso }]);
  });

  it('R2: replaced parts require a description and a photo; no replacement forbids all three', async () => {
    const errors = await errorsOf(await api().post({ ...valid, houveTrocaPecas: true }));
    expect(errors).toEqual([
      expect.objectContaining({ field: 'descricaoPecas', rule: 'R2' }),
      expect.objectContaining({ field: 'fotosPecas', rule: 'R2' }),
    ]);

    const blank = await errorsOf(
      await api().post({ ...valid, houveTrocaPecas: true, descricaoPecas: '   ', fotosPecas: [] }),
    );
    expect(blank.map((e) => e.field).sort()).toEqual(['descricaoPecas', 'fotosPecas']);
    expect(blank.every((e) => e.rule === undefined)).toBe(true);

    expect((await api().post({ ...valid, ...pecas })).status).toBe(201);
    expect((await api().post({ ...valid, ...pecas, custoPecas: 380.5 })).status).toBe(201);

    // The boundary: a zero cost is still a cost informed.
    const cost = await errorsOf(await api().post({ ...valid, custoPecas: 0 }));
    expect(cost).toEqual([expect.objectContaining({ field: 'custoPecas', rule: 'R2' })]);

    const noReplacement = await errorsOf(await api().post({ ...valid, ...pecas, houveTrocaPecas: false }));
    expect(noReplacement).toEqual([
      expect.objectContaining({ field: 'descricaoPecas', rule: 'R2' }),
      expect.objectContaining({ field: 'fotosPecas', rule: 'R2' }),
    ]);
  });

  it('R3: warranty forbids parts cost and hourly rate; "avulsa" requires the hourly rate', async () => {
    const warranty = { ...valid, ...pecas, cobertura: 'garantia' };
    expect((await api().post(warranty)).status).toBe(201);

    const both = await errorsOf(await api().post({ ...warranty, custoPecas: 0, valorHora: 0 }));
    expect(both).toEqual([
      expect.objectContaining({ field: 'custoPecas', rule: 'R3' }),
      expect.objectContaining({ field: 'valorHora', rule: 'R3' }),
    ]);

    const avulsa = await errorsOf(await api().post({ ...valid, cobertura: 'avulsa' }));
    expect(avulsa).toEqual([expect.objectContaining({ field: 'valorHora', rule: 'R3' })]);
    // The boundary: a zero hourly rate counts as informed.
    expect((await api().post({ ...valid, cobertura: 'avulsa', valorHora: 0 })).status).toBe(201);

    // Warranty without a replacement: R2 already rejects the parts cost, so the field gets one error, not two.
    const overlap = await errorsOf(await api().post({ ...valid, cobertura: 'garantia', custoPecas: 5 }));
    expect(overlap).toEqual([expect.objectContaining({ field: 'custoPecas', rule: 'R2' })]);

    // "contrato" neither requires nor forbids either value.
    expect((await api().post({ ...valid, ...pecas, custoPecas: 10, valorHora: 100 })).status).toBe(201);
  });

  it('R4: custoTotal is parts plus hours times rate, missing values as zero, rounded to cents', async () => {
    expect(compute(valid).custoTotal).toBe(0);
    expect(compute({ ...valid, ...pecas, custoPecas: 380.5 }).custoTotal).toBe(380.5);
    expect(compute({ ...valid, valorHora: 120 }).custoTotal).toBe(240);
    expect(compute({ ...valid, ...pecas, custoPecas: 380.5, horasTrabalhadas: 3.5, valorHora: 120 }).custoTotal).toBe(800.5);
    // The boundary: half a cent rounds up, despite binary floating point.
    expect(compute({ ...valid, horasTrabalhadas: 0.5, valorHora: 120.01 }).custoTotal).toBe(60.01);
    expect(compute({ ...valid, ...pecas, custoPecas: 1.005 }).custoTotal).toBe(1.01);
    expect(compute({ ...valid, ...pecas, custoPecas: 1.004 }).custoTotal).toBe(1);

    const client = api();
    const response = await client.post({ ...valid, ...pecas, custoPecas: 10.1, valorHora: 33.33, cobertura: 'avulsa' });
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };
    expect(await (await client.get(`/ordens-servico/${id}`)).json()).toMatchObject({ custoTotal: 76.76 });
    expect(await errorsOf(await api().post({ ...valid, custoTotal: 1 }))).toEqual([
      expect.objectContaining({ field: 'custoTotal' }),
    ]);
  });

  it('R5: an equipment not released requires the reason; a released one forbids it', async () => {
    const errors = await errorsOf(await api().post({ ...valid, equipamentoLiberado: false }));
    expect(errors).toEqual([expect.objectContaining({ field: 'motivoNaoLiberacao', rule: 'R5' })]);
    const withReason = { ...valid, equipamentoLiberado: false, motivoNaoLiberacao: 'Aguardando peça' };
    expect((await api().post(withReason)).status).toBe(201);

    const released = await errorsOf(await api().post({ ...valid, motivoNaoLiberacao: 'Aguardando peça' }));
    expect(released).toEqual([expect.objectContaining({ field: 'motivoNaoLiberacao', rule: 'R5' })]);

    // A blank reason is a structural error, not the rule.
    const blank = await errorsOf(await api().post({ ...valid, equipamentoLiberado: false, motivoNaoLiberacao: '  ' }));
    const message = ordemServico.messages.fields.motivoNaoLiberacao;
    expect(blank).toEqual([{ field: 'motivoNaoLiberacao', message }]);
  });

  it('reports structural errors with the field message, not the library text', async () => {
    const errors = await errorsOf(await api().post({ ...valid, horasTrabalhadas: 0.4, dataEncerramento: '12/11/2026' }));
    expect(errors).toEqual([
      { field: 'dataEncerramento', message: 'Informe a data de encerramento no formato AAAA-MM-DD.' },
      { field: 'horasTrabalhadas', message: 'Informe as horas trabalhadas, de 0,5 a 500.' },
    ]);
  });
});
