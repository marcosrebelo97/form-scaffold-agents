import { fromRow, toRow } from '../../core/model.js';
import type { Repository } from '../../core/repository.js';
import { model } from './model.js';
import type { InspecaoEquipamento, InspecaoEquipamentoComputed, InspecaoEquipamentoInput } from './types.js';

/** R4: one point per open issue. */
export function compute(input: InspecaoEquipamentoInput): InspecaoEquipamentoComputed {
  const issues = [input.possuiFalhas, !input.itensSegurancaOk, !input.manualDisponivel, !input.lubrificacaoRealizada];
  return { pendencias: issues.filter(Boolean).length };
}

export function createService(repository: Repository) {
  return {
    async create(input: InspecaoEquipamentoInput): Promise<InspecaoEquipamento> {
      const row = await repository.insert(model, toRow(model, { ...input, ...compute(input) }));
      return fromRow<InspecaoEquipamento>(model, row);
    },
    async get(id: string): Promise<InspecaoEquipamento | undefined> {
      const row = await repository.get(model, id);
      return row && fromRow<InspecaoEquipamento>(model, row);
    },
    async list(): Promise<InspecaoEquipamento[]> {
      return (await repository.list(model)).map((row) => fromRow<InspecaoEquipamento>(model, row));
    },
  };
}

export type InspecaoEquipamentoService = ReturnType<typeof createService>;
