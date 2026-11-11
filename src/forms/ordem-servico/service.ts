import { fromRow, toRow } from '../../core/model.js';
import type { Repository } from '../../core/repository.js';
import { model } from './model.js';
import type { OrdemServico, OrdemServicoComputed, OrdemServicoInput } from './types.js';

/** R4: parts plus hours times the hourly rate, missing values as zero, rounded to cents. */
export function compute(input: OrdemServicoInput): OrdemServicoComputed {
  const total = (input.custoPecas ?? 0) + input.horasTrabalhadas * (input.valorHora ?? 0);
  // toPrecision drops binary noise first, so 1.005 rounds to 1.01, not 1.
  return { custoTotal: Math.round(Number((total * 100).toPrecision(15))) / 100 };
}

export function createService(repository: Repository) {
  return {
    async create(input: OrdemServicoInput): Promise<OrdemServico> {
      const row = await repository.insert(model, toRow(model, { ...input, ...compute(input) }));
      return fromRow<OrdemServico>(model, row);
    },
    async get(id: string): Promise<OrdemServico | undefined> {
      const row = await repository.get(model, id);
      return row && fromRow<OrdemServico>(model, row);
    },
    async list(): Promise<OrdemServico[]> {
      return (await repository.list(model)).map((row) => fromRow<OrdemServico>(model, row));
    },
  };
}

export type OrdemServicoService = ReturnType<typeof createService>;
